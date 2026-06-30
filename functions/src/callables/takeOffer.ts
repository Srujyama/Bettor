/**
 * takeOffer — a DIFFERENT user LAYS the other side of an open/partial offer. One
 * atomic transaction:
 *   re-read the offer (must be open/partial with remainingStake > 0) → reject
 *   taking your own offer → re-read the bet (still accepting) → compute the fill
 *   with the SHARED computeFill(remainingStake, odds, budget) → re-read the taker
 *   (age/RG gate) → assert the taker can cover fill.layerRisk → escrow layerRisk
 *   via the ledger (OFFER_ESCROW) → write bets/{betId}/matches/{matchId}
 *   (FixedOddsMatch, status='matched') → decrement offer.remainingStake and flip
 *   status to 'partial' or 'filled'.
 *
 * Partial fills are supported (the taker's budget may not cover the whole offer).
 * The winner of the matched pair takes the whole pot on settlement (see
 * settleFixedOddsMatches). Idempotent on the client key.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { TakeOfferPayloadSchema } from '../shared/schemas-cards';
import { acceptsEntries } from '../shared/betStateMachine';
import { assertOdds, computeFill } from '../shared/fixedodds';
import { LEDGER_DIRECTION, LEDGER_REASON, STAKE } from '../shared/constants';
import { assertChips } from '../shared/money';

export const takeOffer = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = TakeOfferPayloadSchema.parse(req.data);
    assertChips(payload.budget, 'budget');
    if (payload.budget < STAKE.MIN) {
      throw new HttpsError('invalid-argument', `Minimum lay budget is ${STAKE.MIN} Chips.`);
    }

    const matchId = newUlid();

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(payload.betId));
      const offerRef = db.doc(paths.offer(payload.betId, payload.offerId));
      const matchRef = db.doc(paths.match(payload.betId, matchId));
      const userRef = db.doc(paths.user(uid));

      const [betSnap, offerSnap, userSnap] = await Promise.all([
        tx.get(betRef),
        tx.get(offerRef),
        tx.get(userRef),
      ]);
      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      if (!offerSnap.exists) throw new HttpsError('not-found', 'Offer not found.');

      const bet = betSnap.data()!;
      const offer = offerSnap.data()!;
      const ts = now();

      // The bet must still be accepting entries.
      if (!acceptsEntries(bet.status as never) || ts >= (bet.lockAt as number)) {
        throw new HttpsError('failed-precondition', 'This bet is no longer accepting offers.');
      }

      const offerStatus = offer.status as string;
      if (offerStatus !== 'open' && offerStatus !== 'partial') {
        throw new HttpsError('failed-precondition', 'This offer is no longer takeable.');
      }
      const makerUid = offer.makerUid as string;
      if (makerUid === uid) {
        throw new HttpsError('failed-precondition', 'You cannot take your own offer.');
      }

      const remainingStake = (offer.remainingStake as number) ?? 0;
      if (remainingStake <= 0) {
        throw new HttpsError('failed-precondition', 'This offer is fully matched.');
      }
      const odds = offer.odds as number;
      assertOdds(odds);

      // Compute the fill with the shared, integer-conserving math.
      const fill = computeFill(remainingStake, odds, payload.budget);
      if (!fill || fill.backerStakeMatched <= 0 || fill.layerRisk <= 0) {
        throw new HttpsError(
          'failed-precondition',
          'Your budget is too small to lay any of this offer.',
        );
      }

      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const balance = (user.chipsBalance as number) ?? 0;
      if (fill.layerRisk > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips to lay this offer.');
      }

      // Escrow the taker's risk (balance → held).
      const ledgerRes = await postLedgerTxn(tx, {
        idempotencyKey: `offer:take:${payload.betId}:${payload.offerId}:${uid}:${payload.idempotencyKey}`,
        txnGroupId: `offer:take:${payload.betId}:${matchId}`,
        betId: payload.betId,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: fill.layerRisk,
            reason: LEDGER_REASON.OFFER_ESCROW,
            bucket: 'escrow',
            memo: `Laid offer ${payload.offerId} on bet ${payload.betId}`,
          },
        ],
      });
      const newBalance = ledgerRes.posted[0]?.balanceAfter ?? balance - fill.layerRisk;

      // Write the matched pair. The maker backs `backedOutcomeId`; the taker lays it.
      tx.set(matchRef, {
        matchId,
        betId: payload.betId,
        offerId: payload.offerId,
        makerUid,
        takerUid: uid,
        takerName: (user.displayName as string) ?? 'Player',
        takerPhotoURL: (user.photoURL as string | null) ?? null,
        backedOutcomeId: offer.outcomeId as string,
        odds,
        backerStake: fill.backerStakeMatched,
        layerRisk: fill.layerRisk,
        pot: fill.pot,
        status: 'matched',
        winner: null,
        createdAt: ts,
        settledAt: null,
      });

      // Decrement the offer's unmatched stake; flip status.
      const remainingAfter = fill.remainingAfter;
      tx.set(
        offerRef,
        {
          remainingStake: remainingAfter,
          status: remainingAfter <= 0 ? 'filled' : 'partial',
        },
        { merge: true },
      );

      return {
        ok: true,
        matchId,
        backerStakeMatched: fill.backerStakeMatched,
        layerRisk: fill.layerRisk,
        pot: fill.pot,
        remainingStake: remainingAfter,
        newBalance,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to take offer.');
  }
});
