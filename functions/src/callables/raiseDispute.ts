/**
 * raiseDispute — a participant contests a proposed resolution within the dispute
 * window. Creates a disputes doc and flips the bet to 'disputed', which freezes
 * the post-window settlement sweep until trust & safety (admin) resolves it.
 * Moves NO money.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { makeId } from '../shared/ids';
import { BET_STATUS } from '../shared/constants';
import { z } from 'zod';

const RaiseDisputePayloadSchema = z.object({
  betId: z.string(),
  reason: z.string().min(1).max(500),
  evidencePath: z.string().nullable().optional(),
});

export const raiseDispute = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = RaiseDisputePayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(payload.betId));
      const entryRef = db.doc(paths.entry(payload.betId, uid));
      const [betSnap, entrySnap] = await Promise.all([tx.get(betRef), tx.get(entryRef)]);

      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;
      const status = bet.status as string;

      // Only contestable while pending resolution, and only inside the window.
      if (status !== BET_STATUS.PENDING_RESOLUTION) {
        throw new HttpsError('failed-precondition', 'There is no proposed result to dispute.');
      }
      const windowEnd = (bet.disputeWindowEndsAt as number | null) ?? 0;
      if (windowEnd > 0 && now() > windowEnd) {
        throw new HttpsError('failed-precondition', 'The dispute window has closed.');
      }
      // Only participants (or the creator) may dispute.
      if (!entrySnap.exists && uid !== (bet.creatorUid as string)) {
        throw new HttpsError('permission-denied', 'Only participants may dispute this bet.');
      }

      const disputeId = makeId('disp');
      tx.set(db.doc(paths.dispute(payload.betId, disputeId)), {
        disputeId,
        raisedBy: uid,
        reason: payload.reason,
        evidencePath: payload.evidencePath ?? null,
        status: 'open',
        createdAt: now(),
        resolvedAt: null,
      });

      tx.set(betRef, { status: BET_STATUS.DISPUTED }, { merge: true });

      return { ok: true, disputeId };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to raise dispute.');
  }
});
