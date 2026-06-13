/**
 * Friendship callables. Friendships are stored as MIRRORED docs under each
 * user: users/{me}/friends/{them} and users/{them}/friends/{me}, kept in sync
 * by the server so each side sees the correct pending_out / pending_in status.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { z } from 'zod';

const SendFriendRequestSchema = z
  .object({ targetUid: z.string().optional(), handle: z.string().optional() })
  .refine((d) => !!d.targetUid || !!d.handle, { message: 'targetUid or handle required' });

const RespondFriendRequestSchema = z.object({
  fromUid: z.string(),
  accept: z.boolean(),
});

/** Resolve a target uid from either an explicit uid or a handle lookup. */
async function resolveTargetUid(input: { targetUid?: string; handle?: string }): Promise<string> {
  if (input.targetUid) return input.targetUid;
  const handle = (input.handle ?? '').toLowerCase();
  const snap = await db.doc(paths.handle(handle)).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No user with that handle.');
  const uid = snap.data()?.uid as string | undefined;
  if (!uid) throw new HttpsError('not-found', 'No user with that handle.');
  return uid;
}

export const sendFriendRequest = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const input = SendFriendRequestSchema.parse(req.data);
    const targetUid = await resolveTargetUid(input);
    if (targetUid === uid) throw new HttpsError('invalid-argument', 'You cannot friend yourself.');

    await db.runTransaction(async (tx) => {
      const meRef = db.doc(paths.user(uid));
      const themRef = db.doc(paths.user(targetUid));
      const myEdgeRef = db.doc(paths.friend(uid, targetUid));
      const theirEdgeRef = db.doc(paths.friend(targetUid, uid));

      const [meSnap, themSnap, myEdgeSnap] = await Promise.all([
        tx.get(meRef),
        tx.get(themRef),
        tx.get(myEdgeRef),
      ]);
      if (!themSnap.exists) throw new HttpsError('not-found', 'User not found.');
      if (myEdgeSnap.exists && myEdgeSnap.data()?.status === 'accepted') {
        return; // already friends — no-op
      }

      const me = meSnap.data() ?? {};
      const them = themSnap.data() ?? {};
      const ts = now();

      tx.set(myEdgeRef, {
        friendUid: targetUid,
        status: 'pending_out',
        createdAt: ts,
        displayNameCache: (them.displayName as string) ?? '',
        photoURLCache: (them.photoURL as string | null) ?? null,
        handleCache: (them.handle as string) ?? '',
      });
      tx.set(theirEdgeRef, {
        friendUid: uid,
        status: 'pending_in',
        createdAt: ts,
        displayNameCache: (me.displayName as string) ?? '',
        photoURLCache: (me.photoURL as string | null) ?? null,
        handleCache: (me.handle as string) ?? '',
      });
    });

    return { ok: true, targetUid };
  } catch (e) {
    throw toHttpsError(e, 'Failed to send friend request.');
  }
});

export const respondFriendRequest = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { fromUid, accept } = RespondFriendRequestSchema.parse(req.data);
    if (fromUid === uid) throw new HttpsError('invalid-argument', 'Invalid request.');

    await db.runTransaction(async (tx) => {
      const myEdgeRef = db.doc(paths.friend(uid, fromUid));
      const theirEdgeRef = db.doc(paths.friend(fromUid, uid));
      const myEdgeSnap = await tx.get(myEdgeRef);

      if (!myEdgeSnap.exists || myEdgeSnap.data()?.status !== 'pending_in') {
        throw new HttpsError('failed-precondition', 'No pending friend request from this user.');
      }

      if (accept) {
        tx.set(myEdgeRef, { status: 'accepted' }, { merge: true });
        tx.set(theirEdgeRef, { status: 'accepted' }, { merge: true });
      } else {
        tx.delete(myEdgeRef);
        tx.delete(theirEdgeRef);
      }
    });

    return { ok: true, accepted: accept };
  } catch (e) {
    throw toHttpsError(e, 'Failed to respond to friend request.');
  }
});
