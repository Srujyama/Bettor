/**
 * resolveBet — propose the winning outcome. Moves NO money.
 *   - creator/admin modes: the creator (resolverUid) or an admin proposes a
 *     winner; the bet transitions locked|pending_resolution → pending_resolution
 *     with a dispute window. Settlement happens later (after the window) via the
 *     scheduled sweep.
 *   - consensus mode: resolution is decided by votes (see voteOutcome); a direct
 *     resolveBet call is rejected and clients should use voteOutcome instead.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { ResolveBetPayloadSchema } from '../shared/schemas';
import { BET_STATUS, RESOLUTION_MODE, TIMING } from '../shared/constants';

export const resolveBet = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = ResolveBetPayloadSchema.parse(req.data);
    const isAdmin = req.auth?.token?.admin === true;

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(payload.betId));
      const betSnap = await tx.get(betRef);
      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;
      const status = bet.status as string;
      const mode = (bet.resolutionMode as string) ?? RESOLUTION_MODE.CREATOR;

      // Consensus bets resolve via votes, not a direct call.
      if (mode === RESOLUTION_MODE.CONSENSUS && !isAdmin) {
        throw new HttpsError(
          'failed-precondition',
          'This bet resolves by participant vote. Cast your vote instead.',
        );
      }

      // Authorize the resolver.
      const resolverUid = (bet.resolverUid as string | null) ?? (bet.creatorUid as string);
      if (!isAdmin && uid !== resolverUid) {
        throw new HttpsError('permission-denied', 'Only the bet host can resolve this bet.');
      }

      // Must be locked (or already pending, e.g. correcting a proposal) to resolve.
      if (status !== BET_STATUS.LOCKED && status !== BET_STATUS.PENDING_RESOLUTION) {
        throw new HttpsError('failed-precondition', `Bet cannot be resolved from status ${status}.`);
      }

      // Validate the proposed outcome exists.
      const outcomes = (bet.outcomes as { id: string }[]) ?? [];
      if (!outcomes.some((o) => o.id === payload.winningOutcomeId)) {
        throw new HttpsError('invalid-argument', 'Unknown outcome.');
      }

      const ts = now();
      tx.set(
        betRef,
        {
          status: BET_STATUS.PENDING_RESOLUTION,
          proposedOutcomeId: payload.winningOutcomeId,
          winningOutcomeId: payload.winningOutcomeId,
          resolvedAt: ts,
          disputeWindowEndsAt: ts + TIMING.DISPUTE_WINDOW_MS,
        },
        { merge: true },
      );

      return { ok: true, disputeWindowEndsAt: ts + TIMING.DISPUTE_WINDOW_MS };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to resolve bet.');
  }
});
