/**
 * cancelEntry — withdraw an entry while the bet is still 'open'. Refunds the
 * escrow back to balance (STAKE_REFUND), deletes the entry doc, and decrements
 * the pool counters. Atomic + idempotent (refunding deletes the entry, so a
 * retry finds nothing to do).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { allowsCancel } from '../shared/betStateMachine';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';
import { z } from 'zod';

const CancelEntryPayloadSchema = z.object({ betId: z.string() });

export const cancelEntry = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { betId } = CancelEntryPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(betId));
      const entryRef = db.doc(paths.entry(betId, uid));

      const [betSnap, entrySnap] = await Promise.all([tx.get(betRef), tx.get(entryRef)]);
      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      if (!entrySnap.exists) {
        // Nothing to cancel — treat as idempotent success.
        return { ok: true, refunded: 0, alreadyCancelled: true };
      }

      const bet = betSnap.data()!;
      if (!allowsCancel(bet.status as never)) {
        throw new HttpsError('failed-precondition', 'This bet can no longer be left.');
      }

      const entry = entrySnap.data()!;
      const stake = entry.stake as number;
      const outcomeId = entry.outcomeId as string;

      // Refund: held → balance (CREDIT to the balance bucket).
      await postLedgerTxn(tx, {
        idempotencyKey: `cancel:${betId}:${uid}`,
        txnGroupId: `cancel:${betId}:${uid}`,
        betId,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: stake,
            reason: LEDGER_REASON.STAKE_REFUND,
            bucket: 'release',
            memo: `Cancelled entry on bet ${betId}`,
          },
        ],
      });

      // Decrement pool counters.
      tx.set(
        betRef,
        {
          poolTotal: FieldValue.increment(-stake),
          [`poolByOutcome.${outcomeId}`]: FieldValue.increment(-stake),
          entryCount: FieldValue.increment(-1),
        },
        { merge: true },
      );

      // Roll back the lifetime-wagered counter for this stake.
      tx.set(
        db.doc(paths.user(uid)),
        { lifetimeWagered: FieldValue.increment(-stake) },
        { merge: true },
      );

      // Delete the entry.
      tx.delete(entryRef);

      return { ok: true, refunded: stake };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to cancel entry.');
  }
});
