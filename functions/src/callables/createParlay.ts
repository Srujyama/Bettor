/**
 * createParlay — build a multi-leg slip and escrow the stake. ONE atomic
 * transaction: re-read the user → assert allowed + stake within bounds + ≤
 * available balance → debit the stake into escrow via the ledger (STAKE_ESCROW)
 * → write parlays/{slipId} (ParlaySlip) as 'live' with the server-computed
 * multiplier (parlayMultiplier).
 *
 * In the Chip pilot a parlay is a FIXED-ODDS house book: the slip pays out
 * stake × multiplier from the house if every leg hits, else the stake is lost.
 * We cap the multiplier (MAX_MULTIPLIER) so the house's worst-case exposure on a
 * single slip is bounded. Settlement happens later in settleParlay once every
 * leg resolves. Idempotent on the client-supplied idempotencyKey.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { formatPaths } from '../lib/formatPaths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { CreateParlayPayloadSchema } from '../shared/schemas-ext';
import { parlayMultiplier } from '../shared/formats';
import { makeId } from '../shared/ids';
import { LEDGER_DIRECTION, LEDGER_REASON, STAKE } from '../shared/constants';
import { assertChips } from '../shared/money';

/** Bound the house's per-slip exposure: payout never exceeds stake × this. */
export const PARLAY_MAX_MULTIPLIER = 100;

export const createParlay = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateParlayPayloadSchema.parse(req.data);
    assertChips(payload.stake, 'stake');

    if (payload.stake < STAKE.MIN) {
      throw new HttpsError('invalid-argument', `Minimum stake is ${STAKE.MIN} Chips.`);
    }
    if (payload.stake > STAKE.DEFAULT_MAX) {
      throw new HttpsError('invalid-argument', `Maximum parlay stake is ${STAKE.DEFAULT_MAX} Chips.`);
    }

    // Compute the (capped) multiplier from the picks' decimal odds.
    const rawMultiplier = parlayMultiplier(payload.legs);
    const multiplier = Math.min(rawMultiplier, PARLAY_MAX_MULTIPLIER);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const balance = (user.chipsBalance as number) ?? 0;
      if (payload.stake > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this stake.');
      }

      // Idempotency: a slip with this key for this user already exists → return it.
      const dupSnap = await tx.get(
        db
          .collection(formatPaths.parlays())
          .where('uid', '==', uid)
          .where('idempotencyKey', '==', payload.idempotencyKey)
          .limit(1),
      );
      if (!dupSnap.empty) {
        const existing = dupSnap.docs[0].data();
        return { ok: true, slipId: existing.slipId as string, multiplier: existing.multiplier as number, replayed: true };
      }

      const slipId = makeId('slip');
      const ts = now();

      // Escrow the stake (balance → held). Namespace the idempotency key by the
      // slip + uid so a reused key can never replay a different user's escrow.
      const ledgerRes = await postLedgerTxn(tx, {
        idempotencyKey: `parlay:${slipId}:${uid}:${payload.idempotencyKey}`,
        txnGroupId: `parlay:${slipId}:${uid}`,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: payload.stake,
            reason: LEDGER_REASON.STAKE_ESCROW,
            bucket: 'escrow',
            memo: `Parlay stake ${slipId}`,
          },
        ],
      });

      const legs = payload.legs.map((leg, i) => ({
        legId: makeId('leg'),
        betId: leg.betId ?? null,
        fixtureId: leg.fixtureId ?? null,
        label: leg.label,
        pickOutcomeId: leg.pickOutcomeId,
        odds: leg.odds ?? null,
        resultOutcomeId: null as string | null,
        // Order index kept stable for the live slip view.
        order: i,
      }));

      tx.set(db.doc(formatPaths.parlay(slipId)), {
        slipId,
        uid,
        displayName: (user.displayName as string) ?? 'Player',
        photoURL: (user.photoURL as string | null) ?? null,
        legs,
        stake: payload.stake,
        multiplier,
        status: 'live',
        payout: null,
        createdAt: ts,
        idempotencyKey: payload.idempotencyKey,
        ledgerEntryIdEscrow: ledgerRes.posted[0]?.entryId ?? null,
      });

      return { ok: true, slipId, multiplier };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create parlay.');
  }
});
