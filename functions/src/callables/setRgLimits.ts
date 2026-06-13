/**
 * setRgLimits — update the user's responsible-gaming limits and/or start a
 * self-exclusion period. Records an audit entry in users/{uid}/rg_events.
 * Self-exclusion can only be extended, never shortened, from the client.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { makeId } from '../shared/ids';
import { SetRgLimitsPayloadSchema } from '../shared/schemas';

export const setRgLimits = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = SetRgLimitsPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
      const user = userSnap.data()!;
      const currentLimits = (user.rgLimits ?? {}) as Record<string, unknown>;

      const ts = now();
      const nextLimits: Record<string, unknown> = { ...currentLimits };

      if (payload.dailyStakeLimit !== undefined) nextLimits.dailyStakeLimit = payload.dailyStakeLimit;
      if (payload.weeklyStakeLimit !== undefined) nextLimits.weeklyStakeLimit = payload.weeklyStakeLimit;
      if (payload.dailyBetCountLimit !== undefined) nextLimits.dailyBetCountLimit = payload.dailyBetCountLimit;
      if (payload.sessionReminderMins !== undefined) nextLimits.sessionReminderMins = payload.sessionReminderMins;

      // Self-exclusion: client may only extend it.
      if (payload.selfExcludeForMs !== undefined && payload.selfExcludeForMs !== null) {
        const newUntil = ts + payload.selfExcludeForMs;
        const existingUntil = (currentLimits.selfExclusionUntil as number | null) ?? null;
        if (existingUntil != null && newUntil < existingUntil) {
          throw new HttpsError('failed-precondition', 'A self-exclusion period cannot be shortened.');
        }
        nextLimits.selfExclusionUntil = newUntil;
      }

      tx.set(userRef, { rgLimits: nextLimits }, { merge: true });

      // Audit trail.
      const eventId = makeId('rg');
      tx.set(db.doc(`${paths.rgEvents(uid)}/${eventId}`), {
        eventId,
        uid,
        type: payload.selfExcludeForMs ? 'self_exclusion' : 'limits_update',
        limits: nextLimits,
        createdAt: ts,
      });

      return { ok: true };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to update limits.');
  }
});
