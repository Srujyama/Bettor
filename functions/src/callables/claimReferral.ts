/**
 * claimReferral — retroactively attribute a referrer for a user who did NOT
 * supply a referral code at sign-up (verifyAge already credits referrals at the
 * age-gate). Write-once: a user can be referred by at most one person, never
 * themselves, and the credit is granted exactly once via the ledger.
 *
 * This is the post-hoc path; the canonical path remains verifyAge. The referrer
 * earns REFERRAL_BONUS Chips (house DEBIT → referrer CREDIT). One transaction,
 * idempotent on the (referrer, referred) pair.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { ECONOMY, LEDGER_REASON } from '../shared/constants';
import { z } from 'zod';

const ClaimReferralSchema = z.object({ referralCode: z.string().min(1).max(16) });

export const claimReferral = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { referralCode } = ClaimReferralSchema.parse(req.data);
    const code = referralCode.trim();

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));

      // Resolve the referrer by code (read BEFORE any write).
      const refSnap = await tx.get(
        db.collection(paths.users()).where('referralCode', '==', code).limit(1),
      );

      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      // Write-once: already attributed → no-op (no double grant).
      if (user.referredBy) {
        return { ok: true, alreadyReferred: true, bonusGranted: 0 };
      }
      if (refSnap.empty) {
        throw new HttpsError('not-found', 'That referral code is not valid.');
      }
      const referrer = refSnap.docs[0];
      if (referrer.id === uid) {
        throw new HttpsError('failed-precondition', 'You cannot refer yourself.');
      }

      // Credit the referrer (idempotent on the pair).
      await grantChips(tx, {
        uid: referrer.id,
        amount: ECONOMY.REFERRAL_BONUS,
        reason: LEDGER_REASON.REFERRAL_BONUS,
        idempotencyKey: `referral_bonus:${referrer.id}:${uid}`,
        memo: `Referral bonus — ${uid} joined`,
      });

      tx.set(userRef, { referredBy: referrer.id }, { merge: true });

      return { ok: true, referrerUid: referrer.id, bonusGranted: ECONOMY.REFERRAL_BONUS };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to apply referral code.');
  }
});
