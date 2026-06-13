/**
 * voteOutcome — consensus resolution. A participant writes their vote to
 * votes/{uid}. The `tallyVotes` trigger counts votes and, once the consensus
 * threshold is met, proposes the winning outcome and opens the dispute window.
 * Moves NO money. Only entrants of the bet may vote.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { BET_STATUS, RESOLUTION_MODE } from '../shared/constants';
import { z } from 'zod';

const VoteOutcomePayloadSchema = z.object({
  betId: z.string(),
  outcomeId: z.string(),
});

export const voteOutcome = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = VoteOutcomePayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(payload.betId));
      const entryRef = db.doc(paths.entry(payload.betId, uid));
      const [betSnap, entrySnap] = await Promise.all([tx.get(betRef), tx.get(entryRef)]);

      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;

      if ((bet.resolutionMode as string) !== RESOLUTION_MODE.CONSENSUS) {
        throw new HttpsError('failed-precondition', 'This bet does not resolve by vote.');
      }
      const status = bet.status as string;
      if (status !== BET_STATUS.LOCKED && status !== BET_STATUS.PENDING_RESOLUTION) {
        throw new HttpsError('failed-precondition', 'Voting is not open for this bet.');
      }
      if (!entrySnap.exists) {
        throw new HttpsError('permission-denied', 'Only participants may vote on the outcome.');
      }
      const outcomes = (bet.outcomes as { id: string }[]) ?? [];
      if (!outcomes.some((o) => o.id === payload.outcomeId)) {
        throw new HttpsError('invalid-argument', 'Unknown outcome.');
      }

      tx.set(db.doc(paths.vote(payload.betId, uid)), {
        uid,
        outcomeId: payload.outcomeId,
        createdAt: now(),
      });

      return { ok: true };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to record vote.');
  }
});
