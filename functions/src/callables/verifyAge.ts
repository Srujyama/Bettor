/**
 * verifyAge — write-once 18+ verification. Computes age from the supplied DOB
 * (server-trusted, never a client checkbox), records ageVerified+dateOfBirth,
 * and grants the one-time signup chips via the ledger. Applies a referral code:
 * the referrer earns REFERRAL_BONUS chips. All in one transaction; idempotent.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { VerifyAgePayloadSchema } from '../shared/schemas';
import { ECONOMY, LEDGER_REASON } from '../shared/constants';

const EIGHTEEN_YEARS_MS = 18 * 365.25 * 24 * 60 * 60 * 1000;

export const verifyAge = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = VerifyAgePayloadSchema.parse(req.data);

    const ageMs = now() - payload.dateOfBirth;
    if (ageMs < EIGHTEEN_YEARS_MS) {
      throw new HttpsError('failed-precondition', 'You must be at least 18 years old to use Chipd.');
    }

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      // Write-once: if already verified, no-op (no double grant).
      if (user.ageVerified === true) {
        return { ok: true, chipsGranted: 0, alreadyVerified: true };
      }

      // Resolve a referral code (if provided & not self-referral) before writing.
      let referrerUid: string | null = null;
      const code = payload.referralCode?.trim();
      if (code) {
        const refSnap = await tx.get(
          db.collection(paths.users()).where('referralCode', '==', code).limit(1),
        );
        if (!refSnap.empty) {
          const candidate = refSnap.docs[0];
          if (candidate.id !== uid) referrerUid = candidate.id;
        }
      }

      // IMPORTANT: Firestore transactions require ALL reads before ANY writes.
      // grantChips() reads the idempotency marker + account docs, so it must run
      // before the age-field write below.

      // Grant the one-time signup chips (house DEBIT → user CREDIT). This also
      // writes the user's balance fields via merge.
      await grantChips(tx, {
        uid,
        amount: ECONOMY.SIGNUP_GRANT,
        reason: LEDGER_REASON.SIGNUP_GRANT,
        idempotencyKey: `signup_grant:${uid}`,
        memo: 'Welcome to Chipd',
      });

      // Credit the referrer.
      if (referrerUid) {
        await grantChips(tx, {
          uid: referrerUid,
          amount: ECONOMY.REFERRAL_BONUS,
          reason: LEDGER_REASON.REFERRAL_BONUS,
          idempotencyKey: `referral_bonus:${referrerUid}:${uid}`,
          memo: `Referral bonus — ${uid} joined`,
        });
      }

      // Mark age-verified + region (write-once for compliance fields). Merges
      // onto the same user doc grantChips already wrote — order is irrelevant
      // for merge writes as long as it follows all reads.
      tx.set(
        userRef,
        {
          ageVerified: true,
          dateOfBirth: payload.dateOfBirth,
          kycLevel: 'self_attested',
          region: payload.region ?? user.region ?? 'MO',
          ...(referrerUid ? { referredBy: referrerUid } : {}),
        },
        { merge: true },
      );

      return { ok: true, chipsGranted: ECONOMY.SIGNUP_GRANT };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to verify age.');
  }
});
