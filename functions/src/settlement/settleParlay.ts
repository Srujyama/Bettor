/**
 * Parlay settlement — the fixed-odds house book for multi-leg slips.
 *
 * A slip's legs are resolved from two authoritative sources:
 *   • bet legs    → the bet's settlement/result.winningOutcomeId (the same doc
 *                   the peer-pool settlement engine writes).
 *   • fixture legs → fixtures/{id}.winner mapped to the leg's pickOutcomeId
 *                   convention ('home' | 'away' | 'draw').
 *
 * Once EVERY leg has a result we settle the slip in ONE atomic transaction:
 *   - parlayHits  → PAYOUT = stake × multiplier (paid by the HOUSE), released
 *                   escrow + house-funded profit; status 'hit' → 'settled'.
 *   - parlayBusted/miss → the slip loses: escrow is forfeited to the house;
 *                   status 'busted' → 'settled'.
 * Idempotent: a slip already in a terminal status is a no-op (and the ledger
 * idempotency key `settleParlay:{slipId}` guards a retry mid-transaction).
 */
import { Transaction } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { formatPaths } from '../lib/formatPaths';
import { now } from '../lib/time';
import { postLedgerTxn, LedgerLeg } from '../lib/ledger';
import { parlayHits, parlayBusted, type ParlayLegLike } from '../shared/formats';
import { HOUSE_UID, LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

interface PersistedLeg extends ParlayLegLike {
  legId: string;
  betId?: string | null;
  fixtureId?: string | null;
  label: string;
}

/** Map a fixture winner ('home'|'away'|'draw') to a leg pick convention. */
function fixtureResultOutcomeId(winner: string | null | undefined): string | null {
  if (winner === 'home' || winner === 'away' || winner === 'draw') return winner;
  return null;
}

/**
 * Try to resolve each still-pending leg from its source doc. Returns the legs
 * with `resultOutcomeId` filled where a final result is now known. Pure of
 * writes — only reads bet settlements + fixtures.
 */
async function resolveLegs(legs: PersistedLeg[]): Promise<PersistedLeg[]> {
  const resolved: PersistedLeg[] = [];
  for (const leg of legs) {
    if (leg.resultOutcomeId != null) {
      resolved.push(leg);
      continue;
    }
    let result: string | null = null;
    if (leg.betId) {
      const settlementSnap = await db.doc(paths.settlement(leg.betId)).get();
      if (settlementSnap.exists) {
        result = (settlementSnap.data()?.winningOutcomeId as string | null) ?? null;
      }
    } else if (leg.fixtureId) {
      const fixtureSnap = await db.doc(formatPaths.fixture(leg.fixtureId)).get();
      if (fixtureSnap.exists) {
        const f = fixtureSnap.data()!;
        if ((f.status as string) === 'final') {
          result = fixtureResultOutcomeId(f.winner as string | null | undefined);
        }
      }
    }
    resolved.push({ ...leg, resultOutcomeId: result });
  }
  return resolved;
}

/** Whether every leg now has a known result. */
function allLegsResolved(legs: PersistedLeg[]): boolean {
  return legs.length > 0 && legs.every((l) => l.resultOutcomeId != null);
}

export interface SettleParlayResult {
  settled: boolean;
  status: 'live' | 'hit' | 'busted' | 'settled';
  payout: number;
}

/**
 * Resolve + (when fully resolved) settle a single slip. Safe to call from a
 * trigger, a scheduled sweep, or a manual admin path. Persists any newly-known
 * leg results even when the slip is not yet fully resolved (so the live view
 * shows per-leg hit/miss), and short-circuits a bust as soon as one leg misses.
 */
export async function settleParlaySlip(slipId: string): Promise<SettleParlayResult> {
  return db.runTransaction(async (tx: Transaction) => {
    const slipRef = db.doc(formatPaths.parlay(slipId));
    const slipSnap = await tx.get(slipRef);
    if (!slipSnap.exists) return { settled: false, status: 'live', payout: 0 };

    const slip = slipSnap.data()!;
    const status = slip.status as SettleParlayResult['status'];
    // Already terminal → no-op.
    if (status === 'settled') {
      return { settled: false, status: 'settled', payout: (slip.payout as number) ?? 0 };
    }

    const rawLegs = (slip.legs as PersistedLeg[]) ?? [];
    const legs = await resolveLegs(rawLegs);

    // Persist freshly-known leg results regardless of whether we settle now.
    const busted = parlayBusted(legs);
    const ready = busted || allLegsResolved(legs);

    if (!ready) {
      // Not settleable yet — just write back any newly-resolved leg results.
      tx.set(slipRef, { legs, status: 'live' }, { merge: true });
      return { settled: false, status: 'live', payout: 0 };
    }

    const uid = slip.uid as string;
    const stake = slip.stake as number;
    const multiplier = slip.multiplier as number;
    const hit = !busted && parlayHits(legs);
    const ts = now();

    const ledgerLegs: LedgerLeg[] = [];
    let payout = 0;

    if (hit) {
      // Winner: release their own escrowed stake back to balance...
      ledgerLegs.push({
        uid,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: stake,
        reason: LEDGER_REASON.PAYOUT,
        bucket: 'release',
        memo: `Parlay stake released ${slipId}`,
      });
      payout = Math.floor(stake * multiplier);
      const profit = payout - stake;
      if (profit > 0) {
        // ...and the house funds the profit (house DEBIT → user CREDIT balance).
        ledgerLegs.push({
          uid: HOUSE_UID,
          direction: LEDGER_DIRECTION.DEBIT,
          amount: profit,
          reason: LEDGER_REASON.PAYOUT,
          bucket: 'balance',
          memo: `Parlay house payout ${slipId}`,
        });
        ledgerLegs.push({
          uid,
          direction: LEDGER_DIRECTION.CREDIT,
          amount: profit,
          reason: LEDGER_REASON.PAYOUT,
          bucket: 'balance',
          memo: `Parlay winnings ${slipId}`,
        });
      }
    } else {
      // Loss: the escrowed stake is forfeited to the house.
      ledgerLegs.push({
        uid,
        direction: LEDGER_DIRECTION.DEBIT,
        amount: stake,
        reason: LEDGER_REASON.PAYOUT,
        bucket: 'forfeit',
        memo: `Parlay stake forfeited ${slipId}`,
      });
      ledgerLegs.push({
        uid: HOUSE_UID,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: stake,
        reason: LEDGER_REASON.PAYOUT,
        bucket: 'balance',
        memo: `Parlay loss to house ${slipId}`,
      });
    }

    await postLedgerTxn(tx, {
      idempotencyKey: `settleParlay:${slipId}`,
      txnGroupId: `settleParlay:${slipId}`,
      legs: ledgerLegs,
    });

    tx.set(
      slipRef,
      {
        legs,
        status: 'settled',
        result: hit ? 'hit' : 'busted',
        payout,
        settledAt: ts,
      },
      { merge: true },
    );

    return { settled: true, status: 'settled', payout };
  });
}
