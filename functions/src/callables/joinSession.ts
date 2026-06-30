/**
 * joinSession — add a player to an open session.
 *
 * Two shapes (from JoinSessionPayloadSchema: { sessionId, guestName? }):
 *  - No guestName → the CALLER (a Chipd user) joins themselves. Works in both
 *    modes. Their player doc is keyed by their uid.
 *  - guestName set → the HOST adds a GUEST who isn't a Chipd user. Only allowed
 *    in 'tracking' mode (a guest has no Chips wallet, so they can't be in a chips
 *    game). The guest player doc is keyed by a synthetic guest id.
 *
 * No money moves here (buy-ins do that). We bump playerCount and write the
 * SessionPlayer doc. Joining the same session twice as the same user is a no-op
 * (idempotent on the player docId).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { JoinSessionPayloadSchema } from '../shared/schemas-cards';

export const joinSession = onCall(callableOpts, async (req) => {
  try {
    const callerUid = requireAuth(req);
    const payload = JoinSessionPayloadSchema.parse(req.data);
    const ts = now();
    const isGuest = !!payload.guestName && payload.guestName.trim().length > 0;

    return await db.runTransaction(async (tx) => {
      const sessionRef = db.doc(paths.cardSession(payload.sessionId));

      // ── Reads first ──
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.');
      const session = sessionSnap.data()!;

      if (session.status !== 'open') {
        throw new HttpsError('failed-precondition', 'This session is no longer open to new players.');
      }

      // Decide the player id + identity.
      let playerUid: string;
      let displayName: string;
      let photoURL: string | null = null;

      if (isGuest) {
        // Only the host can add guests, and only in tracking mode.
        if (callerUid !== (session.hostUid as string)) {
          throw new HttpsError('permission-denied', 'Only the host can add guest players.');
        }
        if ((session.mode as string) !== 'tracking') {
          throw new HttpsError(
            'failed-precondition',
            'Guests can only be added in tracking mode (they have no Chips wallet).',
          );
        }
        playerUid = `guest:${newUlid()}`;
        displayName = payload.guestName!.trim().slice(0, 40);
      } else {
        // A real Chipd user joins themselves.
        const userRef = db.doc(paths.user(callerUid));
        const userSnap = await tx.get(userRef);
        const user = userSnap.data();
        assertUserAllowed(user, { requireAge: true });
        playerUid = callerUid;
        displayName = (user.displayName as string) ?? 'Player';
        photoURL = (user.photoURL as string | null) ?? null;
      }

      const playerRef = db.doc(paths.sessionPlayer(payload.sessionId, playerUid));
      // Idempotent: a real user joining twice is a no-op (guests always get a new id).
      if (!isGuest) {
        const existing = await tx.get(playerRef);
        if (existing.exists) {
          return { ok: true, sessionId: payload.sessionId, uid: playerUid, alreadyJoined: true };
        }
      }

      tx.set(playerRef, {
        uid: playerUid,
        displayName,
        photoURL,
        isGuest,
        buyIn: 0,
        cashOut: null,
        place: null,
        net: null,
        joinedAt: ts,
      });

      // Bump count, and (for real users) add to the membership array for reads.
      const sessionUpdate: Record<string, unknown> = { playerCount: FieldValue.increment(1) };
      if (!isGuest) sessionUpdate.memberUids = FieldValue.arrayUnion(playerUid);
      tx.set(sessionRef, sessionUpdate, { merge: true });

      return { ok: true, sessionId: payload.sessionId, uid: playerUid, alreadyJoined: false };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to join session.');
  }
});
