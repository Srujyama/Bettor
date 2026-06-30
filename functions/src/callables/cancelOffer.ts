/**
 * cancelOffer — the MAKER cancels their offer. We refund ONLY the still-unmatched
 * `remainingStake` (release held → balance via OFFER_REFUND) and mark the offer
 * 'cancelled'. Any portions already matched into bets/{betId}/matches stay live
 * and settle normally when the bet resolves — cancelling pulls the offer off the
 * book, it does NOT unwind existing matches.
 *
 * Only the maker may cancel. Idempotent: re-cancelling an already-cancelled offer
 * is a no-op (the ledger refund is keyed so the release can't double-run).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { CancelOfferPayloadSchema } from '../shared/schemas-cards';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

export const cancelOffer = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CancelOfferPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const offerRef = db.doc(paths.offer(payload.betId, payload.offerId));
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists) throw new HttpsError('not-found', 'Offer not found.');

      const offer = offerSnap.data()!;
      if ((offer.makerUid as string) !== uid) {
        throw new HttpsError('permission-denied', 'Only the maker can cancel this offer.');
      }

      const status = offer.status as string;
      // Idempotent no-op if already cancelled.
      if (status === 'cancelled') {
        return { ok: true, offerId: payload.offerId, refunded: 0, newBalance: null, alreadyCancelled: true };
      }
      if (status === 'settled') {
        throw new HttpsError('failed-precondition', 'A settled offer cannot be cancelled.');
      }

      const remainingStake = (offer.remainingStake as number) ?? 0;

      let newBalance: number | null = null;
      if (remainingStake > 0) {
        // Refund the unmatched escrow: release held → balance.
        const ledgerRes = await postLedgerTxn(tx, {
          idempotencyKey: `offer:cancel:${payload.betId}:${payload.offerId}`,
          txnGroupId: `offer:cancel:${payload.betId}:${payload.offerId}`,
          betId: payload.betId,
          legs: [
            {
              uid,
              direction: LEDGER_DIRECTION.CREDIT,
              amount: remainingStake,
              reason: LEDGER_REASON.OFFER_REFUND,
              bucket: 'release',
              memo: `Cancelled unmatched stake on offer ${payload.offerId}`,
            },
          ],
        });
        newBalance = ledgerRes.posted[0]?.balanceAfter ?? null;
      }

      // Pull the offer off the book. Matched portions are untouched.
      tx.set(offerRef, { status: 'cancelled', remainingStake: 0 }, { merge: true });

      return { ok: true, offerId: payload.offerId, refunded: remainingStake, newBalance };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to cancel offer.');
  }
});
