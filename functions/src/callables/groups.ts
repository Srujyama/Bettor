/**
 * Group callables. createGroup makes a group + an owner member doc. joinGroup
 * resolves an inviteCode, adds the caller as a member, and bumps memberCount —
 * all atomically.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { makeId, makeShareCode } from '../shared/ids';
import { z } from 'zod';

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(40),
  emoji: z.string().max(8).optional(),
  description: z.string().max(200).optional(),
  coverColor: z.string().max(16).optional(),
});

const JoinGroupSchema = z.object({ inviteCode: z.string().min(1) });

export const createGroup = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateGroupSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      const groupId = makeId('grp');
      const inviteCode = makeShareCode();
      const ts = now();

      tx.set(db.doc(paths.group(groupId)), {
        groupId,
        name: payload.name,
        description: payload.description ?? '',
        emoji: payload.emoji ?? '🎲',
        ownerUid: uid,
        memberCount: 1,
        createdAt: ts,
        inviteCode,
        coverColor: payload.coverColor ?? '#6C5CE7',
      });

      tx.set(db.doc(paths.groupMember(groupId, uid)), {
        uid,
        role: 'owner',
        displayName: (user.displayName as string) ?? 'Player',
        photoURL: (user.photoURL as string | null) ?? null,
        joinedAt: ts,
      });

      return { ok: true, groupId, inviteCode };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create group.');
  }
});

export const joinGroup = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { inviteCode } = JoinGroupSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      // Resolve the group by invite code (read BEFORE writes).
      const groupQuery = await tx.get(
        db.collection(paths.groups()).where('inviteCode', '==', inviteCode).limit(1),
      );
      if (groupQuery.empty) throw new HttpsError('not-found', 'Invalid invite code.');
      const groupDoc = groupQuery.docs[0];
      const groupId = groupDoc.id;

      const memberRef = db.doc(paths.groupMember(groupId, uid));
      const userRef = db.doc(paths.user(uid));
      const [memberSnap, userSnap] = await Promise.all([tx.get(memberRef), tx.get(userRef)]);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      if (memberSnap.exists) {
        return { ok: true, groupId, alreadyMember: true };
      }

      const ts = now();
      tx.set(memberRef, {
        uid,
        role: 'member',
        displayName: (user.displayName as string) ?? 'Player',
        photoURL: (user.photoURL as string | null) ?? null,
        joinedAt: ts,
      });
      tx.set(db.doc(paths.group(groupId)), { memberCount: FieldValue.increment(1) }, { merge: true });

      return { ok: true, groupId };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to join group.');
  }
});
