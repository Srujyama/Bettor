/**
 * createMarket — open a Kalshi-style YES/NO prediction market. Pure setup, no
 * trading: we pick the LMSR depth `b` from the creator's seed budget, write the
 * market doc at status=open with a 50¢ YES price (qYes==qNo==0), and — if the
 * creator chose to seed liquidity — debit those Chips from them into the HOUSE
 * account (the house holds the subsidy that funds payouts; it's reconciled at
 * resolution). Idempotent on the client-supplied idempotencyKey.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { CreateMarketPayloadSchema } from '../shared/schemas-markets';
import { liquidityForSeed, priceCents } from '../shared/markets';
import { HOUSE_UID, LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

/** Default liquidity budget when the creator doesn't seed their own. */
const DEFAULT_SEED_CHIPS = 2000;

export const createMarket = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateMarketPayloadSchema.parse(req.data);
    const ts = now();

    if (payload.closesAt <= ts) {
      throw new HttpsError('invalid-argument', 'closesAt must be in the future.');
    }
    if (payload.resolvesBy < payload.closesAt) {
      throw new HttpsError('invalid-argument', 'resolvesBy must be on or after closesAt.');
    }

    const seedChips = payload.seedChips ?? 0;
    // Depth: if the creator seeds, size the AMM to that budget; else a sensible default.
    const b = liquidityForSeed(seedChips > 0 ? seedChips : DEFAULT_SEED_CHIPS);

    const marketId = newUlid();

    return await db.runTransaction(async (tx) => {
      const marketRef = db.doc(paths.market(marketId));
      const userRef = db.doc(paths.user(uid));

      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      // If the creator seeds liquidity, debit them; the house holds it.
      if (seedChips > 0) {
        const balance = (user.chipsBalance as number) ?? 0;
        if (seedChips > balance) {
          throw new HttpsError('failed-precondition', 'Insufficient Chips to seed this market.');
        }
        await postLedgerTxn(tx, {
          idempotencyKey: `mkt:create:${uid}:${payload.idempotencyKey}`,
          txnGroupId: `mkt:create:${marketId}`,
          legs: [
            {
              uid,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: seedChips,
              reason: LEDGER_REASON.MARKET_BUY,
              bucket: 'balance',
              memo: `Seed liquidity for market ${marketId}`,
            },
            {
              uid: HOUSE_UID,
              direction: LEDGER_DIRECTION.CREDIT,
              amount: seedChips,
              reason: LEDGER_REASON.MARKET_BUY,
              bucket: 'balance',
              memo: `Liquidity subsidy held for market ${marketId}`,
            },
          ],
        });
      }

      tx.set(marketRef, {
        marketId,
        creatorUid: uid,
        creatorName: (user.displayName as string) ?? 'Player',
        question: payload.question,
        description: payload.description ?? '',
        category: payload.category ?? 'custom',
        imageUrl: payload.imageUrl ?? null,
        qYes: 0,
        qNo: 0,
        b,
        priceYesCents: priceCents({ qYes: 0, qNo: 0, b }, 'yes'),
        volume: 0,
        traderCount: 0,
        status: 'open',
        resolution: null,
        closesAt: payload.closesAt,
        resolvesBy: payload.resolvesBy,
        resolvedAt: null,
        createdAt: ts,
        oracleRef: null,
        heat: 0,
        seedSubsidy: seedChips,
      });

      return { ok: true, marketId };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create market.');
  }
});
