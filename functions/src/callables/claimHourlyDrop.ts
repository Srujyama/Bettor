/**
 * claimHourlyDrop — the "come back every hour" loop. Clamped to once per
 * HOURLY_DROP.COOLDOWN_MS. The consecutive-claim streak grows the reward
 * (hourlyDropAmount) up to a cap and RESETS if the player let more than
 * RESET_AFTER_MS pass since their last claim. The reward is minted from the
 * house via the ledger (HOURLY_DROP reason) — idempotent per claim window.
 *
 * Returns { granted, streak, nextClaimAt } so the client can render the next
 * FOMO countdown without recomputing money.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { LEDGER_REASON } from '../shared/constants';
import { HOURLY_DROP, hourlyDropAmount, hourlyDropReadyIn } from '../shared/engagement';
import { ClaimHourlyDropPayloadSchema, EngagementStateSchema } from '../shared/schemas-markets';

export const claimHourlyDrop = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    ClaimHourlyDropPayloadSchema.parse(req.data ?? {});

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const ts = now();
      const engagement = EngagementStateSchema.partial().parse(user.engagement ?? {});
      const lastClaimAt = engagement.lastHourlyClaimAt ?? null;

      // Still cooling down? Surface the next-claim time, don't grant.
      const readyIn = hourlyDropReadyIn(lastClaimAt, ts);
      if (readyIn > 0) {
        return {
          ok: true,
          granted: 0,
          streak: engagement.hourlyStreak ?? 0,
          nextClaimAt: ts + readyIn,
          alreadyClaimed: true,
        };
      }

      // Streak continues only if the previous claim was within the grace window;
      // otherwise the chain is broken and we start over at 1.
      const prevStreak = engagement.hourlyStreak ?? 0;
      const sinceLast = lastClaimAt == null ? Infinity : ts - lastClaimAt;
      const continued = lastClaimAt != null && sinceLast <= HOURLY_DROP.RESET_AFTER_MS;
      const streak = continued ? prevStreak + 1 : 1;

      const granted = hourlyDropAmount(streak);

      // Idempotency is scoped to this exact claim window (the cooldown bucket),
      // so a double-tap inside the same hour can never mint twice.
      const windowKey = Math.floor(ts / HOURLY_DROP.COOLDOWN_MS);
      await grantChips(tx, {
        uid,
        amount: granted,
        reason: LEDGER_REASON.HOURLY_DROP,
        idempotencyKey: `hourly_drop:${uid}:${windowKey}`,
        memo: `Hourly drop (streak ${streak})`,
      });

      tx.set(
        userRef,
        {
          engagement: {
            ...engagement,
            hourlyStreak: streak,
            lastHourlyClaimAt: ts,
          },
        },
        { merge: true },
      );

      return {
        ok: true,
        granted,
        streak,
        nextClaimAt: ts + HOURLY_DROP.COOLDOWN_MS,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to claim hourly drop.');
  }
});
