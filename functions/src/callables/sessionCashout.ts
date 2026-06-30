/**
 * sessionCashout — record a player's final stack (and finishing place for
 * tournaments). NO money moves here; settleSession does the actual Chip movement.
 * We just set player.cashOut (+ place) and append a cash_out txn so the live
 * settle-up preview can compute everyone's net.
 *
 * Who may record:
 *  - CHIPS mode: self-service for your own stack, OR the host (the host runs the
 *    table and reads off final stacks; no money moves on cash-out so this is safe).
 *  - TRACKING mode: the host (or the player themselves) — same as buy-ins.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { SessionCashoutPayloadSchema } from '../shared/schemas-cards';
import { assertChips } from '../shared/money';

export const sessionCashout = onCall(callableOpts, async (req) => {
  try {
    const callerUid = requireAuth(req);
    const payload = SessionCashoutPayloadSchema.parse(req.data);
    assertChips(payload.amount, 'amount');
    const ts = now();
    const txnId = newUlid();

    return await db.runTransaction(async (tx) => {
      const sessionRef = db.doc(paths.cardSession(payload.sessionId));
      const playerRef = db.doc(paths.sessionPlayer(payload.sessionId, payload.uid));

      const [sessionSnap, playerSnap] = await Promise.all([tx.get(sessionRef), tx.get(playerRef)]);
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.');
      if (!playerSnap.exists) throw new HttpsError('not-found', 'That player is not in this session.');
      const session = sessionSnap.data()!;
      const player = playerSnap.data()!;

      if (session.status === 'settled' || session.status === 'cancelled') {
        throw new HttpsError('failed-precondition', 'This session is already settled.');
      }

      const isHost = callerUid === (session.hostUid as string);
      if (!isHost && payload.uid !== callerUid) {
        throw new HttpsError('permission-denied', 'Only the host can cash out another player.');
      }

      const isTournament = (session.gameType as string) === 'poker_tournament';
      if (isTournament && payload.place == null) {
        // Place is needed to split the prize pool; for tournaments require it.
        throw new HttpsError('invalid-argument', 'A finishing place is required for tournaments.');
      }

      const buyIn = (player.buyIn as number) ?? 0;
      tx.set(
        playerRef,
        {
          cashOut: payload.amount,
          place: payload.place ?? null,
          // Provisional net for the live preview; settle recomputes authoritatively.
          net: payload.amount - buyIn,
        },
        { merge: true },
      );

      const txnRef = db.doc(paths.sessionTxn(payload.sessionId, txnId));
      tx.set(txnRef, {
        txnId,
        uid: payload.uid,
        kind: 'cash_out',
        amount: payload.amount,
        byUid: callerUid,
        createdAt: ts,
      });

      return {
        ok: true,
        sessionId: payload.sessionId,
        uid: payload.uid,
        cashOut: payload.amount,
        net: payload.amount - buyIn,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to record cash-out.');
  }
});
