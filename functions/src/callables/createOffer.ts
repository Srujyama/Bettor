/**
 * createOffer — a MAKER posts a fixed-odds peer offer on a bet ("I'll back YES at
 * 2.0"). One atomic transaction:
 *   re-read the bet (must be 'open' & now < lockAt) → validate the outcome + odds
 *   range → re-read the maker (age/RG/region gate) → assert the maker can cover
 *   their backer stake → escrow backerStake via the ledger (OFFER_ESCROW, balance
 *   → held) → write bets/{betId}/offers/{offerId} at status='open' with
 *   remainingStake == backerStake.
 *
 * The maker is risking `backerStake` to win backerStake*(odds-1); takers lay the
 * other side and get matched (see takeOffer). Idempotent on the client key.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { CreateOfferPayloadSchema } from '../shared/schemas-cards';
import { acceptsEntries } from '../shared/betStateMachine';
import { assertOdds } from '../shared/fixedodds';
import { LEDGER_DIRECTION, LEDGER_REASON, STAKE } from '../shared/constants';
import { assertChips } from '../shared/money';

export const createOffer = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateOfferPayloadSchema.parse(req.data);
    assertChips(payload.backerStake, 'backerStake');
    // Reject out-of-range odds early (also re-checked below for safety).
    assertOdds(payload.odds);

    if (payload.backerStake < STAKE.MIN) {
      throw new HttpsError('invalid-argument', `Minimum offer stake is ${STAKE.MIN} Chips.`);
    }
    if (payload.backerStake > STAKE.ABSOLUTE_MAX) {
      throw new HttpsError('invalid-argument', 'Offer stake is too large.');
    }

    const offerId = newUlid();

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(payload.betId));
      const offerRef = db.doc(paths.offer(payload.betId, offerId));
      const userRef = db.doc(paths.user(uid));

      const [betSnap, userSnap] = await Promise.all([tx.get(betRef), tx.get(userRef)]);
      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;
      const ts = now();

      // The offer book is only live while the bet accepts entries.
      if (!acceptsEntries(bet.status as never) || ts >= (bet.lockAt as number)) {
        throw new HttpsError('failed-precondition', 'This bet is no longer accepting offers.');
      }

      const outcomes = (bet.outcomes as { id: string }[]) ?? [];
      if (!outcomes.some((o) => o.id === payload.outcomeId)) {
        throw new HttpsError('invalid-argument', 'Unknown outcome for this bet.');
      }

      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const balance = (user.chipsBalance as number) ?? 0;
      if (payload.backerStake > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips to back this offer.');
      }

      // Escrow the maker's backer stake (balance → held). Namespace the client key
      // by bet+offer+uid so a reused key from another user can't replay this.
      const ledgerRes = await postLedgerTxn(tx, {
        idempotencyKey: `offer:create:${payload.betId}:${offerId}:${uid}:${payload.idempotencyKey}`,
        txnGroupId: `offer:create:${payload.betId}:${offerId}`,
        betId: payload.betId,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: payload.backerStake,
            reason: LEDGER_REASON.OFFER_ESCROW,
            bucket: 'escrow',
            memo: `Backed offer ${offerId} on bet ${payload.betId}`,
          },
        ],
      });
      const newBalance = ledgerRes.posted[0]?.balanceAfter ?? balance - payload.backerStake;

      tx.set(offerRef, {
        offerId,
        betId: payload.betId,
        makerUid: uid,
        makerName: (user.displayName as string) ?? 'Player',
        makerPhotoURL: (user.photoURL as string | null) ?? null,
        outcomeId: payload.outcomeId,
        odds: payload.odds,
        backerStake: payload.backerStake,
        remainingStake: payload.backerStake,
        status: 'open',
        createdAt: ts,
      });

      return { ok: true, offerId, betId: payload.betId, newBalance };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create offer.');
  }
});
