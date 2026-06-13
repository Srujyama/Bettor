/**
 * oracleResolve — every 5 minutes, auto-resolve anything that is waiting on a
 * sports fixture that is now FINAL.
 *
 *  A) Oracle-linked BETS: a bet whose `oracleRef` points at a final fixture has
 *     its `winningOutcomeId` set (translating the fixture winner → the bet's
 *     outcome via the oracleRef map) and is moved to 'pending_resolution' with a
 *     dispute window — EXACTLY the path resolveBet uses. We do NOT settle here:
 *     the existing settleAfterDisputeWindow sweep owns the money, so there is no
 *     duplicate settlement logic.
 *
 *  B) PARLAY legs: any parlay leg that references a final fixture gets its
 *     `resultOutcomeId` written (the fixture winner side). When every leg has a
 *     result we flip the slip's status to 'hit' or 'busted' using the SHARED
 *     parlay helpers (the pari-mutuel settlement of parlay pools is a separate
 *     concern; here we only record results so the slip can be settled later).
 *
 * Each unit is its own small transaction so one bad doc can't wedge the sweep.
 * Moves NO money.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { BET_STATUS, TIMING } from '../shared/constants';
import { parlayBusted, parlayHits, type ParlayLegLike } from '../shared/formats';
import { parseFixtureOracleRef, type FixtureWinner } from '../sports/oracleRef';

interface FinalFixture {
  fixtureId: string;
  winner: FixtureWinner;
}

/** Load the set of fixtures currently FINAL, keyed by id, with their winner. */
async function loadFinalFixtures(): Promise<Map<string, FinalFixture>> {
  const snap = await db
    .collection(paths.fixtures())
    .where('status', '==', 'final')
    .limit(300)
    .get();
  const map = new Map<string, FinalFixture>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const winner = d.winner as FixtureWinner | null | undefined;
    if (winner) map.set(doc.id, { fixtureId: doc.id, winner });
  }
  return map;
}

/** A) Resolve oracle-linked bets that are locked and awaiting a final fixture. */
async function resolveOracleBets(finals: Map<string, FinalFixture>): Promise<number> {
  // Bets in the oracle flow are 'open' (auto-locks at kickoff) or 'locked'.
  const snap = await db
    .collection(paths.bets())
    .where('resolutionMode', '==', 'oracle')
    .where('status', 'in', [BET_STATUS.OPEN, BET_STATUS.LOCKED])
    .limit(200)
    .get();

  let resolved = 0;
  for (const doc of snap.docs) {
    const ref = parseFixtureOracleRef(doc.data().oracleRef as string | null);
    if (!ref) continue;
    const final = finals.get(ref.fixtureId);
    if (!final) continue;

    const winningOutcomeId = ref.outcomeByWinner[final.winner];
    if (!winningOutcomeId) continue; // e.g. a draw on a 2-outcome bet → leave for the host

    try {
      await db.runTransaction(async (tx) => {
        const betRef = db.doc(paths.bet(doc.id));
        const betSnap = await tx.get(betRef);
        if (!betSnap.exists) return;
        const bet = betSnap.data()!;
        const status = bet.status as string;
        if (status !== BET_STATUS.OPEN && status !== BET_STATUS.LOCKED) return;
        // The outcome must still exist on the bet.
        const outcomes = (bet.outcomes as { id: string }[]) ?? [];
        if (!outcomes.some((o) => o.id === winningOutcomeId)) return;

        const ts = now();
        // Mirror resolveBet exactly: propose the winner + open the dispute window.
        tx.set(
          betRef,
          {
            status: BET_STATUS.PENDING_RESOLUTION,
            // If the bet was still 'open' (kickoff just passed) record the lock too.
            ...(status === BET_STATUS.OPEN ? { lockedAt: ts } : {}),
            proposedOutcomeId: winningOutcomeId,
            winningOutcomeId,
            resolvedAt: ts,
            disputeWindowEndsAt: ts + TIMING.DISPUTE_WINDOW_MS,
          },
          { merge: true },
        );
      });
      resolved++;
    } catch (e) {
      console.error(`[oracleResolve] failed to resolve bet ${doc.id}`, e);
    }
  }
  return resolved;
}

/** B) Write fixture results into live parlay legs and flip slip status. */
async function resolveParlayLegs(finals: Map<string, FinalFixture>): Promise<number> {
  const snap = await db
    .collection(paths.parlays())
    .where('status', '==', 'live')
    .limit(200)
    .get();

  let touched = 0;
  for (const doc of snap.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const slipRef = db.doc(paths.parlay(doc.id));
        const slipSnap = await tx.get(slipRef);
        if (!slipSnap.exists) return;
        const slip = slipSnap.data()!;
        if ((slip.status as string) !== 'live') return;

        const legs = (slip.legs as ParlayLegLike[] & { fixtureId?: string | null }[]) ?? [];
        let changed = false;
        const nextLegs = legs.map((leg) => {
          const fixtureId = (leg as { fixtureId?: string | null }).fixtureId;
          if (!fixtureId) return leg;
          if (leg.resultOutcomeId != null) return leg; // already resolved
          const final = finals.get(fixtureId);
          if (!final) return leg;
          changed = true;
          // The leg's pickOutcomeId is a winner side ('home'|'away'|'draw'); the
          // result is the actual winner side.
          return { ...leg, resultOutcomeId: final.winner };
        });

        if (!changed) return;

        // Recompute slip status from the SHARED helpers (single source of truth).
        const evalLegs = nextLegs as ParlayLegLike[];
        let status: 'live' | 'hit' | 'busted' = 'live';
        if (parlayBusted(evalLegs)) status = 'busted';
        else if (parlayHits(evalLegs)) status = 'hit';

        tx.set(slipRef, { legs: nextLegs, status }, { merge: true });
      });
      touched++;
    } catch (e) {
      console.error(`[oracleResolve] failed to resolve parlay ${doc.id}`, e);
    }
  }
  return touched;
}

export const oracleResolve = onSchedule(
  { region: REGION, schedule: 'every 5 minutes', timeZone: 'Asia/Macau' },
  async () => {
    const finals = await loadFinalFixtures();
    if (finals.size === 0) {
      console.log('[oracleResolve] no final fixtures pending');
      return;
    }
    const [bets, parlays] = await Promise.all([
      resolveOracleBets(finals),
      resolveParlayLegs(finals),
    ]);
    console.log(`[oracleResolve] proposed ${bets} bet winners, touched ${parlays} parlays`);
  },
);
