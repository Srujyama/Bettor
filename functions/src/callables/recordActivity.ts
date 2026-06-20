/**
 * recordActivity — the app calls this once on open to maintain the day-streak
 * meter (engagement.dayStreak + lastActiveDay) on the user doc. NO money moves
 * here; it only advances the consecutive-Macau-day counter:
 *   - same Macau day  → no-op (streak unchanged)
 *   - next Macau day  → streak + 1
 *   - a gap > 1 day   → streak resets to 1
 * CF-write-only so clients can't fabricate a streak. Cheap + idempotent within
 * a day (the same-day branch is a no-op write of the same values).
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now, macauDayKey, macauDaysBetween } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { EngagementStateSchema } from '../shared/schemas-markets';

export const recordActivity = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      // Activity ping doesn't require the age gate (no money) — but still gate
      // banned/excluded accounts.
      assertUserAllowed(user, { requireAge: false });

      const ts = now();
      const today = macauDayKey(ts);
      const engagement = EngagementStateSchema.partial().parse(user.engagement ?? {});
      const lastDay = engagement.lastActiveDay ?? null;
      const prevStreak = engagement.dayStreak ?? 0;

      // Already counted today.
      if (lastDay === today) {
        return { ok: true, dayStreak: prevStreak, lastActiveDay: today, changed: false };
      }

      let dayStreak: number;
      if (lastDay == null) {
        dayStreak = 1;
      } else {
        // Reconstruct a timestamp for the last active day at noon to compare days.
        const lastMs = Date.parse(`${lastDay}T12:00:00+08:00`);
        const gap = Number.isNaN(lastMs) ? 99 : macauDaysBetween(lastMs, ts);
        dayStreak = gap === 1 ? prevStreak + 1 : 1;
      }

      tx.set(
        userRef,
        {
          engagement: {
            ...engagement,
            dayStreak,
            lastActiveDay: today,
          },
        },
        { merge: true },
      );

      return { ok: true, dayStreak, lastActiveDay: today, changed: true };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to record activity.');
  }
});
