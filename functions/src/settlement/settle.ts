/**
 * Settlement engine — the integrity core. ONE atomic Firestore transaction:
 *  1. Re-read the bet; verify it is in a settleable state and not disputed.
 *  2. Load ALL entries.
 *  3. Compute payouts with the SHARED money functions (so client preview and
 *     server result are byte-identical) per marketModel + winningOutcomeId.
 *  4. verifyConservation — abort if a single Chip would be created/destroyed.
 *  5. Post the payout ledger (release winners' escrow → balance with profit,
 *     forfeit losers' escrow, house rake leg) idempotently.
 *  6. Write the settlement/result doc (fixed id → dedupe), flip entry statuses,
 *     update per-user stats, transition bet resolved → settled.
 *
 * Idempotent: if settlement/result already exists, the whole thing is a no-op.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { postLedgerTxn, LedgerLeg } from '../lib/ledger';
import { requireAdmin, settlementOpts, toHttpsError } from '../lib/guards';
import {
  BET_STATUS,
  HOUSE_UID,
  LEDGER_DIRECTION,
  LEDGER_REASON,
  MARKET_MODEL,
} from '../shared/constants';
import {
  refundAll,
  settlePariMutuel,
  settleWinnerTakeAll,
  SettlementResult,
  verifyConservation,
} from '../shared/money';
import { assertTransition } from '../shared/betStateMachine';
import { z } from 'zod';

const SettleBetPayloadSchema = z.object({
  betId: z.string(),
  /** Force a refund-all settlement regardless of winner (void path). */
  refund: z.boolean().optional(),
  /** Override the winning outcome (admin correction); else use bet.winningOutcomeId. */
  winningOutcomeId: z.string().optional(),
});

export interface RunSettlementOptions {
  /** Force refundAll (used by void sweeps). */
  refund?: boolean;
  /** Who triggered it: 'system' | adminUid. */
  settledBy: string;
  /** Override winner (admin only). */
  winningOutcomeIdOverride?: string;
  /** The target terminal status. 'settled' for normal resolution, 'voided' for void. */
  terminalStatus?: typeof BET_STATUS.SETTLED | typeof BET_STATUS.VOIDED;
}

interface EntryRow {
  uid: string;
  stake: number;
  outcomeId: string;
  status: string;
}

/** Compute the settlement result for a bet from its entries (pure dispatch). */
function computeResult(
  marketModel: string,
  rakeBps: number,
  winningOutcomeId: string | null,
  entries: EntryRow[],
  forceRefund: boolean,
): SettlementResult {
  if (forceRefund || !winningOutcomeId) {
    return refundAll(entries.map((e) => ({ uid: e.uid, stake: e.stake })));
  }
  if (marketModel === MARKET_MODEL.WINNER_TAKE_ALL) {
    return settleWinnerTakeAll(entries, winningOutcomeId, rakeBps);
  }
  // PARI_MUTUEL (and FIXED_ODDS_P2P falls back to pari-mutuel split in v1).
  return settlePariMutuel(entries, winningOutcomeId, rakeBps);
}

/**
 * The atomic settlement core. Safe to call from a callable, a trigger, or a
 * sweep. Returns whether it actually settled (false = already settled / no-op).
 */
export async function runSettlement(
  betId: string,
  opts: RunSettlementOptions,
): Promise<{ settled: boolean; payoutTotal: number; model: string }> {
  const terminalStatus = opts.terminalStatus ?? BET_STATUS.SETTLED;

  return db.runTransaction(async (tx: Transaction) => {
    const betRef = db.doc(paths.bet(betId));
    const settlementRef = db.doc(paths.settlement(betId));

    const [betSnap, settlementSnap] = await Promise.all([tx.get(betRef), tx.get(settlementRef)]);
    if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');

    // Idempotency: a result doc means we already settled this bet.
    if (settlementSnap.exists) {
      const d = settlementSnap.data()!;
      return { settled: false, payoutTotal: (d.payoutTotal as number) ?? 0, model: (d.model as string) ?? 'NONE' };
    }

    const bet = betSnap.data()!;
    const status = bet.status as string;

    // A bet must be RESOLVED to settle normally; void path settles from any
    // escrowed pre-terminal state via refundAll.
    const isVoidPath = terminalStatus === BET_STATUS.VOIDED || !!opts.refund;
    if (!isVoidPath && status !== BET_STATUS.RESOLVED) {
      throw new HttpsError('failed-precondition', `Bet must be resolved to settle (is ${status}).`);
    }
    // Settlement is frozen while a dispute is open.
    if (status === BET_STATUS.DISPUTED && !isVoidPath) {
      throw new HttpsError('failed-precondition', 'Bet is disputed; cannot settle.');
    }
    // Validate the state-machine transition we are about to perform.
    assertTransition(status as never, terminalStatus as never);

    // Load all entries.
    const entriesSnap = await tx.get(db.collection(paths.entries(betId)));
    const entries: EntryRow[] = entriesSnap.docs
      .map((d) => d.data())
      .filter((e) => (e.status as string) === 'placed')
      .map((e) => ({
        uid: e.uid as string,
        stake: e.stake as number,
        outcomeId: e.outcomeId as string,
        status: e.status as string,
      }));

    const rakeBps = (bet.rakeBps as number) ?? 0;
    const winningOutcomeId = opts.winningOutcomeIdOverride ?? (bet.winningOutcomeId as string | null) ?? null;
    const result = computeResult(
      bet.marketModel as string,
      rakeBps,
      winningOutcomeId,
      entries,
      !!opts.refund || isVoidPath,
    );

    // Defensive: re-prove conservation against the bet's recorded pool.
    const recordedPool = (bet.poolTotal as number) ?? result.pool;
    if (recordedPool !== result.pool) {
      throw new HttpsError(
        'internal',
        `Pool mismatch: bet.poolTotal=${recordedPool} != sum(entries)=${result.pool}`,
      );
    }
    verifyConservation(result.pool, result.payoutTotal, result.rake);

    const payoutByUid = new Map(result.payouts.map((p) => [p.uid, p]));
    const ts = now();

    // Build ledger legs. Winners: release escrow back to balance for their stake
    // + credit the profit (won from losers' forfeited escrow). Losers: forfeit
    // their escrow. House: take rake (if any) as a CREDIT to the house balance.
    const legs: LedgerLeg[] = [];
    for (const e of entries) {
      const payout = payoutByUid.get(e.uid);
      const amount = payout?.amount ?? 0;
      if (amount >= e.stake) {
        // Release their own escrow back to balance...
        legs.push({
          uid: e.uid,
          direction: LEDGER_DIRECTION.CREDIT,
          amount: e.stake,
          reason: LEDGER_REASON.PAYOUT,
          bucket: 'release',
          memo: `Stake released for bet ${betId}`,
        });
        const profit = amount - e.stake;
        if (profit > 0) {
          // ...and credit profit to balance (sourced from losers' forfeited escrow).
          legs.push({
            uid: e.uid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: profit,
            reason: LEDGER_REASON.PAYOUT,
            bucket: 'balance',
            memo: `Winnings for bet ${betId}`,
          });
        }
      } else {
        // Partial/zero payout: release whatever they get, forfeit the remainder.
        if (amount > 0) {
          legs.push({
            uid: e.uid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount,
            reason: LEDGER_REASON.PAYOUT,
            bucket: 'release',
            memo: `Partial payout for bet ${betId}`,
          });
        }
        const forfeit = e.stake - amount;
        if (forfeit > 0) {
          legs.push({
            uid: e.uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: forfeit,
            reason: LEDGER_REASON.PAYOUT,
            bucket: 'forfeit',
            memo: `Stake forfeited for bet ${betId}`,
          });
        }
      }
    }
    // House rake leg (0 in pilot, but conservable when non-zero). Rake comes from
    // forfeited escrow, so it is a CREDIT to the house balance bucket.
    if (result.rake > 0) {
      legs.push({
        uid: HOUSE_UID,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: result.rake,
        reason: LEDGER_REASON.RAKE,
        bucket: 'balance',
        memo: `Rake for bet ${betId}`,
      });
    }

    const ledgerResult =
      legs.length > 0
        ? await postLedgerTxn(tx, {
            idempotencyKey: `settle:${betId}`,
            txnGroupId: `settle:${betId}`,
            betId,
            legs,
          })
        : { posted: [], txnGroupId: `settle:${betId}`, replayed: false };

    const payoutEntryByUid = new Map(
      ledgerResult.posted
        .filter((p) => p.reason === LEDGER_REASON.PAYOUT && p.direction === LEDGER_DIRECTION.CREDIT)
        .map((p) => [p.uid, p.entryId]),
    );

    // Flip each entry's status + payoutAmount, and update per-user stats.
    const winningOutcomeForStats = result.model === 'REFUND_ALL' ? null : winningOutcomeId;
    for (const e of entries) {
      const payout = payoutByUid.get(e.uid);
      const amount = payout?.amount ?? 0;
      const isRefund = result.model === 'REFUND_ALL';
      const won = !isRefund && e.outcomeId === winningOutcomeForStats;
      const entryStatus = isRefund ? 'refunded' : won ? 'won' : 'lost';

      tx.set(
        db.doc(paths.entry(betId, e.uid)),
        {
          status: entryStatus,
          payoutAmount: amount,
          ledgerEntryIdPayout: payoutEntryByUid.get(e.uid) ?? null,
        },
        { merge: true },
      );

      // Stats: only on real settlement, never on refund/void.
      if (!isRefund) {
        const userRef = db.doc(paths.user(e.uid));
        const profit = amount - e.stake;
        const statUpdate: Record<string, unknown> = {
          lifetimeWon: FieldValue.increment(amount),
        };
        if (won) {
          statUpdate.winCount = FieldValue.increment(1);
          statUpdate.currentStreak = FieldValue.increment(1);
          statUpdate.xp = FieldValue.increment(Math.max(1, Math.floor(profit / 10)) + 10);
        } else {
          statUpdate.lossCount = FieldValue.increment(1);
          statUpdate.currentStreak = 0;
        }
        tx.set(userRef, statUpdate, { merge: true });
      }
    }

    // Write the immutable settlement/result doc (fixed id → dedupe).
    tx.set(settlementRef, {
      betId,
      model: result.model,
      winningOutcomeId: result.model === 'REFUND_ALL' ? null : winningOutcomeId,
      pool: result.pool,
      rake: result.rake,
      payoutTotal: result.payoutTotal,
      checksum: result.payoutTotal + result.rake === result.pool,
      payouts: result.payouts.map((p) => ({ uid: p.uid, amount: p.amount, profit: p.profit })),
      settledAt: ts,
      settledBy: opts.settledBy,
    });

    // Transition the bet to its terminal status.
    tx.set(
      betRef,
      {
        status: terminalStatus,
        settledAt: ts,
        settlementId: 'result',
        ...(terminalStatus === BET_STATUS.VOIDED ? { winningOutcomeId: null } : {}),
      },
      { merge: true },
    );

    return { settled: true, payoutTotal: result.payoutTotal, model: result.model };
  });
}

/**
 * Admin/system callable to force-settle a bet. Normal settlement flows through
 * the scheduled `settleAfterDisputeWindow` sweep; this is the manual override.
 */
export const settleBet = onCall(settlementOpts, async (req) => {
  try {
    requireAdmin(req);
    const payload = SettleBetPayloadSchema.parse(req.data);
    const res = await runSettlement(payload.betId, {
      settledBy: req.auth!.uid,
      refund: payload.refund,
      winningOutcomeIdOverride: payload.winningOutcomeId,
      terminalStatus: payload.refund ? BET_STATUS.VOIDED : BET_STATUS.SETTLED,
    });
    return { ok: true, ...res };
  } catch (e) {
    throw toHttpsError(e, 'Failed to settle bet.');
  }
});
