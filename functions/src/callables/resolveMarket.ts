/**
 * resolveMarket — admin/oracle resolution of a prediction market, then payout.
 *
 *  1. resolveMarket (callable, admin): set market.resolution + status=resolved.
 *     Idempotent: a market already resolved/voided is a no-op.
 *  2. runMarketSettlement: pay SHARE_PAYOUT (100 Chips) per winning share from the
 *     HOUSE account (which has been holding the trade float + creator subsidy),
 *     zero out losing shares. Processed in batched transactions per position so a
 *     huge market never blows the 500-write transaction limit. Idempotent via a
 *     per-position `settled` flag plus a per-position ledger idempotency key, and a
 *     market-level settlement marker written once the sweep completes.
 *
 * The exported `runMarketSettlement` is also used by the scheduled void sweep
 * (refund path) — there it refunds each position's cost basis instead of paying
 * winners (see autoVoidMarketsSweep / void mode).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { requireAdmin, settlementOpts, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { ResolveMarketPayloadSchema } from '../shared/schemas-markets';
import { MarketSide, SHARE_PAYOUT } from '../shared/markets';
import { HOUSE_UID, LEDGER_DIRECTION, LEDGER_REASON, LedgerReason } from '../shared/constants';

const POSITION_PAGE = 200;

export interface MarketSettlementResult {
  settled: boolean;
  paidPositions: number;
  payoutTotal: number;
}

/**
 * Pay (or refund) every position on a resolved/voided market in batched
 * transactions. Idempotent: each position flips its own `settled` flag inside the
 * same transaction as its ledger leg (idempotency-keyed), so retries are no-ops.
 *
 * @param mode 'resolve' pays winners SHARE_PAYOUT/share; 'void' refunds cost basis.
 */
export async function runMarketSettlement(
  marketId: string,
  resolution: MarketSide | null,
  mode: 'resolve' | 'void',
): Promise<MarketSettlementResult> {
  let paidPositions = 0;
  let payoutTotal = 0;

  const positionsCol = db.collection(paths.marketPositions(marketId));
  // Page through positions; settle each in its own small transaction.
  let lastDocId: string | null = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = positionsCol.orderBy('uid').limit(POSITION_PAGE);
    if (lastDocId) q = q.startAfter(lastDocId);
    const page = await q.get();
    if (page.empty) break;

    for (const docSnap of page.docs) {
      lastDocId = docSnap.id;
      const uid = docSnap.id;
      const positionRef = db.doc(paths.marketPosition(marketId, uid));

      const result = await db.runTransaction(async (tx) => {
        const snap = await tx.get(positionRef);
        if (!snap.exists) return { paid: 0 };
        const pos = snap.data()!;
        if (pos.settled === true) return { paid: 0 }; // already done

        const ts = now();
        const yesShares = (pos.yesShares as number) ?? 0;
        const noShares = (pos.noShares as number) ?? 0;

        let credit = 0;
        let reason: LedgerReason;
        if (mode === 'void') {
          // Refund the net cost basis still tied up in open shares.
          credit = Math.max(0, (pos.costBasis as number) ?? 0);
          reason = LEDGER_REASON.MARKET_REFUND;
        } else {
          const winningShares = resolution === 'yes' ? yesShares : noShares;
          credit = Math.floor(winningShares * SHARE_PAYOUT);
          reason = LEDGER_REASON.MARKET_PAYOUT;
        }

        if (credit > 0) {
          await postLedgerTxn(tx, {
            idempotencyKey: `mkt:settle:${marketId}:${uid}`,
            txnGroupId: `mkt:settle:${marketId}`,
            legs: [
              {
                uid: HOUSE_UID,
                direction: LEDGER_DIRECTION.DEBIT,
                amount: credit,
                reason,
                bucket: 'balance',
                memo: `Market ${mode === 'void' ? 'refund' : 'payout'} ${marketId}`,
              },
              {
                uid,
                direction: LEDGER_DIRECTION.CREDIT,
                amount: credit,
                reason,
                bucket: 'balance',
                memo: `Market ${mode === 'void' ? 'refund' : 'payout'} ${marketId}`,
              },
            ],
          });
        }

        tx.set(
          positionRef,
          {
            settled: true,
            settledAt: ts,
            settledPayout: credit,
            // Zero out shares: they are resolved/refunded now.
            yesShares: 0,
            noShares: 0,
            realizedPnl:
              mode === 'void'
                ? (pos.realizedPnl as number) ?? 0
                : ((pos.realizedPnl as number) ?? 0) + (credit - ((pos.costBasis as number) ?? 0)),
          },
          { merge: true },
        );

        return { paid: credit };
      });

      if (result.paid > 0) {
        paidPositions += 1;
        payoutTotal += result.paid;
      }
    }

    if (page.size < POSITION_PAGE) break;
  }

  // Mark the market settlement done (idempotent marker for callers/sweeps).
  await db.doc(paths.marketSettlement(marketId)).set(
    {
      marketId,
      mode,
      resolution: resolution ?? null,
      paidPositions,
      payoutTotal,
      settledAt: now(),
    },
    { merge: true },
  );

  return { settled: true, paidPositions, payoutTotal };
}

export const resolveMarket = onCall(settlementOpts, async (req) => {
  try {
    const adminUid = requireAdmin(req);
    const payload = ResolveMarketPayloadSchema.parse(req.data);
    const resolution = payload.resolution as MarketSide;

    // Phase 1: flip the market to resolved (atomic, idempotent on status).
    const alreadyResolved = await db.runTransaction(async (tx) => {
      const marketRef = db.doc(paths.market(payload.marketId));
      const snap = await tx.get(marketRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Market not found.');
      const market = snap.data()!;
      const status = market.status as string;
      if (status === 'resolved') return true;
      if (status === 'voided') {
        throw new HttpsError('failed-precondition', 'Market was voided and cannot be resolved.');
      }
      tx.set(
        marketRef,
        {
          status: 'resolved',
          resolution,
          resolvedAt: now(),
          oracleRef: adminUid,
        },
        { merge: true },
      );
      return false;
    });

    // Phase 2: pay out winners (idempotent regardless of phase-1 short-circuit).
    const res = await runMarketSettlement(payload.marketId, resolution, 'resolve');

    return { ok: true, alreadyResolved, ...res };
  } catch (e) {
    throw toHttpsError(e, 'Failed to resolve market.');
  }
});
