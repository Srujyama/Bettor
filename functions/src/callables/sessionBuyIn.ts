/**
 * sessionBuyIn — record a buy-in or rebuy for a player.
 *
 * CHIPS MODE (mode='chips'):
 *   Real Chips move. We escrow the amount OUT of the buying-in player's balance
 *   and INTO the session's pot account via the double-entry ledger
 *   (SESSION_BUYIN, player DEBIT → pot account CREDIT — conserved). Because a
 *   player can only ever spend their OWN Chips, chips-mode buy-ins are
 *   SELF-SERVICE: the buying-in user must be the caller (payload.uid === caller).
 *   A host cannot reach into someone else's wallet.
 *
 * TRACKING MODE (mode='tracking'):
 *   NO money moves. It's a shared scoreboard for an in-person game, so the HOST
 *   may record a buy-in for ANY player (including guests), and a player may
 *   record their own. We just bump the player's running buyIn + the session pot
 *   and append a txn doc.
 *
 * Both modes: player.buyIn += amount, session.pot += amount, append a txn.
 * Idempotency is provided by the ledger (chips mode) keyed per session+txn; in
 * tracking mode each call is a distinct recorded txn (the client de-dupes via a
 * fresh txnId per tap).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { SessionBuyInPayloadSchema } from '../shared/schemas-cards';
import { assertChips } from '../shared/money';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';
import { sessionPotAccount } from './cardPaths';

export const sessionBuyIn = onCall(callableOpts, async (req) => {
  try {
    const callerUid = requireAuth(req);
    const payload = SessionBuyInPayloadSchema.parse(req.data);
    assertChips(payload.amount, 'amount');
    if (payload.amount <= 0) {
      throw new HttpsError('invalid-argument', 'Buy-in amount must be positive.');
    }
    const ts = now();
    const txnId = newUlid();

    return await db.runTransaction(async (tx) => {
      const sessionRef = db.doc(paths.cardSession(payload.sessionId));
      const playerRef = db.doc(paths.sessionPlayer(payload.sessionId, payload.uid));

      // ── Reads first ──
      const [sessionSnap, playerSnap] = await Promise.all([tx.get(sessionRef), tx.get(playerRef)]);
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.');
      if (!playerSnap.exists) throw new HttpsError('not-found', 'That player is not in this session.');
      const session = sessionSnap.data()!;

      if (session.status !== 'open') {
        throw new HttpsError('failed-precondition', 'This session is settled or closed.');
      }

      const isChips = (session.mode as string) === 'chips';
      const isHost = callerUid === (session.hostUid as string);
      const priorBuyIn = (playerSnap.data()!.buyIn as number) ?? 0;
      let newBalance: number | null = null;

      if (isChips) {
        // Self-service only: you can only spend your OWN Chips.
        if (payload.uid !== callerUid) {
          throw new HttpsError(
            'permission-denied',
            'In a Chips game each player buys in with their own Chips.',
          );
        }
        const userRef = db.doc(paths.user(callerUid));
        const userSnap = await tx.get(userRef);
        const user = userSnap.data();
        assertUserAllowed(user, { requireAge: true });
        const balance = (user.chipsBalance as number) ?? 0;
        if (payload.amount > balance) {
          throw new HttpsError('failed-precondition', 'Insufficient Chips for this buy-in.');
        }

        // Escrow: player balance → session pot account (conserved, idempotent).
        const ledgerRes = await postLedgerTxn(tx, {
          idempotencyKey: `session:buyin:${payload.sessionId}:${payload.uid}:${txnId}`,
          txnGroupId: `session:buyin:${payload.sessionId}:${payload.uid}`,
          legs: [
            {
              uid: callerUid,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: payload.amount,
              reason: LEDGER_REASON.SESSION_BUYIN,
              bucket: 'balance',
              memo: `Buy-in to session ${payload.sessionId}`,
            },
            {
              uid: sessionPotAccount(payload.sessionId),
              direction: LEDGER_DIRECTION.CREDIT,
              amount: payload.amount,
              reason: LEDGER_REASON.SESSION_BUYIN,
              bucket: 'balance',
              memo: `Pot received buy-in from ${callerUid}`,
            },
          ],
        });
        // The buying-in player is the first leg; surface their post-debit balance.
        newBalance = ledgerRes.posted[0]?.balanceAfter ?? balance - payload.amount;
      } else {
        // Tracking mode: host can record for anyone; a player can record their own.
        if (!isHost && payload.uid !== callerUid) {
          throw new HttpsError(
            'permission-denied',
            'Only the host can record a buy-in for another player.',
          );
        }
      }

      // ── Common writes: bump player buyIn + session pot, append txn ──
      tx.set(playerRef, { buyIn: FieldValue.increment(payload.amount) }, { merge: true });
      tx.set(sessionRef, { pot: FieldValue.increment(payload.amount) }, { merge: true });

      const txnRef = db.doc(paths.sessionTxn(payload.sessionId, txnId));
      tx.set(txnRef, {
        txnId,
        uid: payload.uid,
        kind: payload.kind,
        amount: payload.amount,
        byUid: callerUid,
        createdAt: ts,
      });

      return {
        ok: true,
        sessionId: payload.sessionId,
        uid: payload.uid,
        txnId,
        amount: payload.amount,
        buyIn: priorBuyIn + payload.amount,
        newBalance: newBalance ?? 0,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to record buy-in.');
  }
});
