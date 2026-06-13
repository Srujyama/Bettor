/**
 * postComment — add a comment to a bet. Rate-limited (reject if the author's
 * last comment on this bet was < 2s ago), length-capped at 280 chars. The
 * author identity is taken from the server-trusted auth + user doc, never the
 * client payload.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { makeId } from '../shared/ids';
import { z } from 'zod';

const PostCommentSchema = z.object({
  betId: z.string(),
  text: z.string().min(1).max(280),
  gifUrl: z.string().url().nullable().optional(),
});

const RATE_LIMIT_MS = 2_000;

export const postComment = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = PostCommentSchema.parse(req.data);

    // Rate-limit: look at this author's most recent comment on the bet.
    const recent = await db
      .collection(paths.comments(payload.betId))
      .where('authorUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const ts = now();
    if (!recent.empty) {
      const last = (recent.docs[0].data().createdAt as number) ?? 0;
      if (ts - last < RATE_LIMIT_MS) {
        throw new HttpsError('resource-exhausted', 'You are commenting too fast. Slow down.');
      }
    }

    const userSnap = await db.doc(paths.user(uid)).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
    const user = userSnap.data()!;

    const betSnap = await db.doc(paths.bet(payload.betId)).get();
    if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');

    const commentId = makeId('cmt');
    await db.doc(paths.comment(payload.betId, commentId)).set({
      commentId,
      authorUid: uid,
      authorName: (user.displayName as string) ?? 'Player',
      authorPhotoURL: (user.photoURL as string | null) ?? null,
      text: payload.text,
      gifUrl: payload.gifUrl ?? null,
      createdAt: ts,
      reactionCounts: {},
    });

    return { ok: true, commentId };
  } catch (e) {
    throw toHttpsError(e, 'Failed to post comment.');
  }
});
