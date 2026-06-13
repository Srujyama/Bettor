/**
 * grantDailyChips — daily check-in. Clamped to once per Macau day. Grants
 * DAILY_GRANT plus a streak bonus (DAILY_STREAK_BONUS per consecutive day,
 * capped at DAILY_STREAK_BONUS_CAP). The streak resets if a day was missed.
 * Idempotent within a day via the last-grant timestamp + a day-scoped key.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { isSameMacauDay, macauDayKey, macauDaysBetween, nextMacauMidnight, now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { ECONOMY, LEDGER_REASON } from '../shared/constants';

export const grantDailyChips = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const ts = now();
      const lastGrant = (user.lastDailyGrantAt as number | null) ?? null;

      // Already claimed today?
      if (lastGrant != null && isSameMacauDay(lastGrant, ts)) {
        return {
          ok: true,
          granted: 0,
          streak: (user.dailyStreak as number) ?? 0,
          nextClaimAt: nextMacauMidnight(ts),
          alreadyClaimed: true,
        };
      }

      // Streak: continues if yesterday, resets otherwise.
      const prevStreak = (user.dailyStreak as number) ?? 0;
      const continued = lastGrant != null && macauDaysBetween(lastGrant, ts) === 1;
      const streak = continued ? prevStreak + 1 : 1;

      // Bonus scales with streak, capped. Day 1 has no bonus.
      const bonus = Math.min(
        ECONOMY.DAILY_STREAK_BONUS * Math.max(0, streak - 1),
        ECONOMY.DAILY_STREAK_BONUS_CAP,
      );
      const granted = ECONOMY.DAILY_GRANT + bonus;

      await grantChips(tx, {
        uid,
        amount: granted,
        reason: LEDGER_REASON.DAILY_GRANT,
        idempotencyKey: `daily_grant:${uid}:${macauDayKey(ts)}`,
        memo: `Daily check-in (day ${streak})`,
      });

      tx.set(userRef, { lastDailyGrantAt: ts, dailyStreak: streak }, { merge: true });

      return { ok: true, granted, streak, nextClaimAt: nextMacauMidnight(ts) };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to grant daily chips.');
  }
});
