/**
 * sendChat — post a message into a crew's chat. Member-only and rate-limited
 * (reject if this author's last message in the group was < 1.5s ago). The
 * author identity (name/photo) is taken from the server-trusted user doc, never
 * the client payload. A message must carry at least one of text / gif / sticker
 * / a shared bet reference. Writes groups/{gid}/chat/{messageId}. No money.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { makeId } from '../shared/ids';
import { SendChatPayloadSchema } from '../shared/schemas-ext';

const RATE_LIMIT_MS = 1_500;

export const sendChat = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = SendChatPayloadSchema.parse(req.data);

    const text = (payload.text ?? '').trim();
    const hasContent =
      text.length > 0 || !!payload.gifUrl || !!payload.stickerKey || !!payload.betRef;
    if (!hasContent) {
      throw new HttpsError('invalid-argument', 'Message is empty.');
    }

    // Member-only: the caller must have a member doc in this group.
    const [memberSnap, userSnap] = await Promise.all([
      db.doc(paths.groupMember(payload.groupId, uid)).get(),
      db.doc(paths.user(uid)).get(),
    ]);
    if (!memberSnap.exists) {
      throw new HttpsError('permission-denied', 'You are not a member of this crew.');
    }
    const user = userSnap.data();
    assertUserAllowed(user, { requireAge: false });

    // Rate-limit: look at this author's most recent message in the group.
    const recent = await db
      .collection(paths.crewChat(payload.groupId))
      .where('authorUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const ts = now();
    if (!recent.empty) {
      const last = (recent.docs[0].data().createdAt as number) ?? 0;
      if (ts - last < RATE_LIMIT_MS) {
        throw new HttpsError('resource-exhausted', 'You are sending messages too fast. Slow down.');
      }
    }

    // If a sticker is used, verify the author owns its pack (compliance: shop
    // cosmetics are owned, not faked client-side). The stickerKey is namespaced
    // as `${packKey}:${stickerIndex}`; the owned cosmetic is the pack key.
    if (payload.stickerKey) {
      const packKey = payload.stickerKey.split(':')[0];
      const owned = await db
        .collection(paths.inventory(uid))
        .where('cosmeticKey', '==', packKey)
        .limit(1)
        .get();
      if (owned.empty) {
        throw new HttpsError('permission-denied', "You don't own that sticker pack.");
      }
    }

    const messageId = makeId('msg');
    await db.doc(paths.crewChatMessage(payload.groupId, messageId)).set({
      messageId,
      groupId: payload.groupId,
      authorUid: uid,
      authorName: (user!.displayName as string) ?? 'Player',
      authorPhotoURL: (user!.photoURL as string | null) ?? null,
      text,
      gifUrl: payload.gifUrl ?? null,
      stickerKey: payload.stickerKey ?? null,
      betRef: payload.betRef ?? null,
      createdAt: ts,
    });

    return { ok: true, messageId };
  } catch (e) {
    throw toHttpsError(e, 'Failed to send message.');
  }
});
