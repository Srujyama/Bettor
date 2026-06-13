/**
 * tallyVotes — consensus resolution counter. Fires whenever a vote is written
 * for a consensus bet. Counts votes per outcome; once an outcome reaches the
 * consensus threshold (fraction of entrants, default 0.6), proposes it as the
 * winner and opens the dispute window — exactly as a creator resolution would.
 * Moves NO money.
 */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { REGION } from '../lib/guards';
import { BET_STATUS, RESOLUTION_MODE, TIMING } from '../shared/constants';

export const tallyVotes = onDocumentWritten(
  { region: REGION, document: 'bets/{betId}/votes/{uid}' },
  async (event) => {
    const betId = event.params.betId;

    await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(betId));
      const betSnap = await tx.get(betRef);
      if (!betSnap.exists) return;
      const bet = betSnap.data()!;

      if ((bet.resolutionMode as string) !== RESOLUTION_MODE.CONSENSUS) return;
      const status = bet.status as string;
      // Only tally while the bet is awaiting resolution.
      if (status !== BET_STATUS.LOCKED && status !== BET_STATUS.PENDING_RESOLUTION) return;
      // Don't re-propose once a winner is set.
      if (bet.winningOutcomeId) return;

      const votesSnap = await tx.get(db.collection(paths.votes(betId)));
      const totalVotes = votesSnap.size;
      if (totalVotes === 0) return;

      const tally = new Map<string, number>();
      for (const d of votesSnap.docs) {
        const oid = d.data().outcomeId as string;
        tally.set(oid, (tally.get(oid) ?? 0) + 1);
      }

      // Threshold is a fraction of the eligible voters (entrants).
      const entrantCount = (bet.entryCount as number) ?? totalVotes;
      const threshold = (bet.consensusThreshold as number | null) ?? 0.6;
      const needed = Math.max(1, Math.ceil(entrantCount * threshold));

      let leader: string | null = null;
      let leaderCount = 0;
      for (const [oid, count] of tally) {
        if (count > leaderCount) {
          leader = oid;
          leaderCount = count;
        }
      }

      if (leader && leaderCount >= needed) {
        const ts = now();
        tx.set(
          betRef,
          {
            status: BET_STATUS.PENDING_RESOLUTION,
            proposedOutcomeId: leader,
            winningOutcomeId: leader,
            resolvedAt: ts,
            disputeWindowEndsAt: ts + TIMING.DISPUTE_WINDOW_MS,
          },
          { merge: true },
        );
      }
    });
  },
);
