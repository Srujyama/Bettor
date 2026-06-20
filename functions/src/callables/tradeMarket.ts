/**
 * tradeMarket — THE markets money path. One atomic transaction:
 *   re-read market (must be open & now < closesAt) → re-read user balance +
 *   position → run the SHARED LMSR math (quoteBuy / quoteSell) → move Chips via
 *   the ledger (MARKET_BUY debit → house, or MARKET_SELL credit ← house) →
 *   update the position (shares / costBasis / realizedPnl), the market AMM state
 *   (qYes / qNo / priceYesCents / volume / traderCount) and write a trade doc.
 *
 * Idempotent on the client idempotencyKey (namespaced by market + uid so a reused
 * key from another user can never replay this user's trade). RG limits + the 18+
 * age gate are enforced (assertUserAllowed + assertWithinRgLimits on a buy).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { assertWithinRgLimits, readRg, rolledRgState } from '../lib/rg';
import { TradeMarketPayloadSchema } from '../shared/schemas-markets';
import {
  MarketState,
  MarketSide,
  priceCents,
  quoteBuy,
  quoteSell,
  SHARE_PAYOUT,
} from '../shared/markets';
import { HOUSE_UID, LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

export const tradeMarket = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = TradeMarketPayloadSchema.parse(req.data);
    const side = payload.side as MarketSide;

    return await db.runTransaction(async (tx) => {
      const marketRef = db.doc(paths.market(payload.marketId));
      const positionRef = db.doc(paths.marketPosition(payload.marketId, uid));
      const userRef = db.doc(paths.user(uid));

      // ── All reads first (Firestore txn rule) ──
      const [marketSnap, positionSnap, userSnap] = await Promise.all([
        tx.get(marketRef),
        tx.get(positionRef),
        tx.get(userRef),
      ]);

      if (!marketSnap.exists) throw new HttpsError('not-found', 'Market not found.');
      const market = marketSnap.data()!;
      const ts = now();

      if ((market.status as string) !== 'open' || ts >= (market.closesAt as number)) {
        throw new HttpsError('failed-precondition', 'This market is no longer trading.');
      }

      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const state: MarketState = {
        qYes: (market.qYes as number) ?? 0,
        qNo: (market.qNo as number) ?? 0,
        b: market.b as number,
      };

      const pos = positionSnap.data();
      const isNewTrader = !positionSnap.exists;
      const yesShares = (pos?.yesShares as number) ?? 0;
      const noShares = (pos?.noShares as number) ?? 0;
      const costBasis = (pos?.costBasis as number) ?? 0;
      const realizedPnl = (pos?.realizedPnl as number) ?? 0;

      const tradeId = newUlid();
      const tradeRef = db.doc(paths.marketTrade(payload.marketId, tradeId));

      let after: MarketState;
      let signedCost: number; // +spent on buy, -proceeds on sell (for the trade doc)
      let shares: number;
      let priceCentsAtTrade: number;
      let nextYesShares = yesShares;
      let nextNoShares = noShares;
      let nextCostBasis = costBasis;
      let nextRealizedPnl = realizedPnl;
      let volumeDelta = 0;

      if (payload.action === 'buy') {
        const budget = Math.floor(payload.amount);
        if (budget <= 0) throw new HttpsError('invalid-argument', 'Budget must be a positive whole number of Chips.');

        const balance = (user.chipsBalance as number) ?? 0;
        if (budget > balance) {
          throw new HttpsError('failed-precondition', 'Insufficient Chips for this trade.');
        }

        // Responsible-gaming limits (roll counters forward first) — a buy is a wager.
        const { state: rgState, limits } = readRg(user);
        const rolled = rolledRgState(rgState, ts);
        assertWithinRgLimits(rolled, limits, budget);

        const quote = quoteBuy(state, side, budget);
        if (quote.shares <= 0 || quote.cost <= 0) {
          throw new HttpsError('failed-precondition', 'Budget too small to buy a whole share at this price.');
        }
        after = quote.after;
        shares = quote.shares;
        signedCost = quote.cost;
        priceCentsAtTrade = quote.avgPriceCents;
        volumeDelta = quote.cost;
        if (side === 'yes') nextYesShares = yesShares + quote.shares;
        else nextNoShares = noShares + quote.shares;
        nextCostBasis = costBasis + quote.cost;

        // Debit Chips → house (the house holds market float, pays winners on resolve).
        await postLedgerTxn(tx, {
          idempotencyKey: `mkt:trade:${payload.marketId}:${uid}:${payload.idempotencyKey}`,
          txnGroupId: `mkt:trade:${payload.marketId}:${uid}`,
          legs: [
            {
              uid,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: quote.cost,
              reason: LEDGER_REASON.MARKET_BUY,
              bucket: 'balance',
              memo: `Buy ${quote.shares} ${side.toUpperCase()} @ ${quote.avgPriceCents}¢ on ${payload.marketId}`,
            },
            {
              uid: HOUSE_UID,
              direction: LEDGER_DIRECTION.CREDIT,
              amount: quote.cost,
              reason: LEDGER_REASON.MARKET_BUY,
              bucket: 'balance',
              memo: `Market float for ${payload.marketId}`,
            },
          ],
        });

        // Update RG counters + lifetime wagered.
        tx.set(
          userRef,
          {
            rgState: {
              todayStaked: rolled.todayStaked + quote.cost,
              weekStaked: rolled.weekStaked + quote.cost,
              todayBetCount: rolled.todayBetCount + 1,
              lastResetAt: rolled.lastResetAt,
            },
            lifetimeWagered: FieldValue.increment(quote.cost),
          },
          { merge: true },
        );
      } else {
        // SELL: amount is a number of shares to sell back to the AMM.
        const sellShares = Math.floor(payload.amount);
        if (sellShares <= 0) throw new HttpsError('invalid-argument', 'Must sell a positive whole number of shares.');
        const held = side === 'yes' ? yesShares : noShares;
        if (sellShares > held) {
          throw new HttpsError('failed-precondition', 'You do not hold that many shares to sell.');
        }

        const quote = quoteSell(state, side, sellShares);
        after = quote.after;
        shares = sellShares;
        signedCost = -quote.proceeds;
        priceCentsAtTrade = priceCents(state, side);
        volumeDelta = quote.proceeds;

        // Realized P/L: proceeds minus the average cost of the shares sold.
        const avgCost = held > 0 ? costBasis * (sellShares / held) : 0;
        const avgCostRounded = Math.round(avgCost);
        nextRealizedPnl = realizedPnl + (quote.proceeds - avgCostRounded);
        nextCostBasis = Math.max(0, costBasis - avgCostRounded);
        if (side === 'yes') nextYesShares = yesShares - sellShares;
        else nextNoShares = noShares - sellShares;

        if (quote.proceeds > 0) {
          // Credit Chips ← house.
          await postLedgerTxn(tx, {
            idempotencyKey: `mkt:trade:${payload.marketId}:${uid}:${payload.idempotencyKey}`,
            txnGroupId: `mkt:trade:${payload.marketId}:${uid}`,
            legs: [
              {
                uid: HOUSE_UID,
                direction: LEDGER_DIRECTION.DEBIT,
                amount: quote.proceeds,
                reason: LEDGER_REASON.MARKET_SELL,
                bucket: 'balance',
                memo: `Market sell proceeds for ${payload.marketId}`,
              },
              {
                uid,
                direction: LEDGER_DIRECTION.CREDIT,
                amount: quote.proceeds,
                reason: LEDGER_REASON.MARKET_SELL,
                bucket: 'balance',
                memo: `Sell ${sellShares} ${side.toUpperCase()} on ${payload.marketId}`,
              },
            ],
          });
        }
      }

      const newPriceYesCents = priceCents(after, 'yes');

      // ── Writes: position, trade doc, market AMM state ──
      tx.set(
        positionRef,
        {
          uid,
          marketId: payload.marketId,
          yesShares: nextYesShares,
          noShares: nextNoShares,
          costBasis: nextCostBasis,
          realizedPnl: nextRealizedPnl,
          updatedAt: ts,
          displayName: (user.displayName as string) ?? 'Player',
          photoURL: (user.photoURL as string | null) ?? null,
        },
        { merge: true },
      );

      tx.set(tradeRef, {
        tradeId,
        marketId: payload.marketId,
        uid,
        side,
        action: payload.action,
        shares,
        cost: signedCost,
        priceCents: priceCentsAtTrade,
        createdAt: ts,
      });

      tx.set(
        marketRef,
        {
          qYes: after.qYes,
          qNo: after.qNo,
          priceYesCents: newPriceYesCents,
          volume: FieldValue.increment(volumeDelta),
          ...(isNewTrader && payload.action === 'buy'
            ? { traderCount: FieldValue.increment(1) }
            : {}),
        },
        { merge: true },
      );

      return {
        ok: true,
        tradeId,
        shares,
        cost: signedCost,
        priceYesCents: newPriceYesCents,
        potentialPayout: payload.action === 'buy' ? shares * SHARE_PAYOUT : 0,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to trade.');
  }
});
