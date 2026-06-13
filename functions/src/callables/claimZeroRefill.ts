/**
 * claimZeroRefill — a safety net. If a user's balance is exactly zero AND they
 * have no Chips held in escrow, they may claim a free refill once the cooldown
 * (ZERO_REFILL_COOLDOWN_MS) has elapsed since their last refill. Grants
 * ZERO_REFILL_AMOUNT via the ledger. Atomic + idempotent.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { ECONOMY, LEDGER_REASON } from '../shared/constants';

export const claimZeroRefill = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const balance = (user.chipsBalance as number) ?? 0;
      const held = (user.chipsHeld as number) ?? 0;
      if (balance > 0 || held > 0) {
        throw new HttpsError(
          'failed-precondition',
          'Refills are only available when you are completely out of Chips.',
        );
      }

      const ts = now();
      const last = (user.lastZeroRefillAt as number | null) ?? null;
      if (last != null && ts - last < ECONOMY.ZERO_REFILL_COOLDOWN_MS) {
        const nextAt = last + ECONOMY.ZERO_REFILL_COOLDOWN_MS;
        throw new HttpsError(
          'resource-exhausted',
          `Please wait before claiming another refill. Available again at ${new Date(nextAt).toISOString()}.`,
        );
      }

      await grantChips(tx, {
        uid,
        amount: ECONOMY.ZERO_REFILL_AMOUNT,
        reason: LEDGER_REASON.ZERO_REFILL,
        idempotencyKey: `zero_refill:${uid}:${ts}`,
        memo: 'Zero-balance refill',
      });

      tx.set(userRef, { lastZeroRefillAt: ts }, { merge: true });

      return { ok: true, granted: ECONOMY.ZERO_REFILL_AMOUNT };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to claim refill.');
  }
});
