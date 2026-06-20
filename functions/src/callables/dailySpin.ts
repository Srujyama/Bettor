/**
 * dailySpin — a free wheel spin once per 24h (DAILY_SPIN.COOLDOWN_MS). The prize
 * is one of DAILY_SPIN.PRIZES, chosen by a provably-fair server random seeded
 * from the player's clientSeed + a server nonce. The reward (which may be 0) is
 * minted from the house (SPIN_REWARD reason); engagement.totalSpins and
 * lastDailySpinAt advance. Idempotent per 24h window.
 *
 * Returns the chosen prize index so the client can animate the dial to the exact
 * resting segment that the server picked.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { grantChips } from '../lib/ledger';
import { LEDGER_REASON } from '../shared/constants';
import { DAILY_SPIN } from '../shared/engagement';
import { rng, seedString } from '../shared/casino';
import { DailySpinPayloadSchema, EngagementStateSchema } from '../shared/schemas-markets';

export const dailySpin = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = DailySpinPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const ts = now();
      const engagement = EngagementStateSchema.partial().parse(user.engagement ?? {});
      const lastSpin = engagement.lastDailySpinAt ?? null;

      // One free spin per cooldown window.
      if (lastSpin != null && ts - lastSpin < DAILY_SPIN.COOLDOWN_MS) {
        return {
          ok: true,
          granted: 0,
          prizeIndex: -1,
          totalSpins: engagement.totalSpins ?? 0,
          nextSpinAt: lastSpin + DAILY_SPIN.COOLDOWN_MS,
          alreadySpun: true,
        };
      }

      // Provably-fair pick: derive a uniform from (serverNonce, clientSeed, window).
      const windowKey = Math.floor(ts / DAILY_SPIN.COOLDOWN_MS);
      const seed = seedString(`spin:${uid}:${windowKey}`, payload.clientSeed, windowKey);
      const r = rng(seed)();
      const prizeIndex = Math.min(DAILY_SPIN.PRIZES.length - 1, Math.floor(r * DAILY_SPIN.PRIZES.length));
      const granted = DAILY_SPIN.PRIZES[prizeIndex] ?? 0;

      // Mint only when the prize is non-zero (a 0-prize spin still counts/cools down).
      if (granted > 0) {
        await grantChips(tx, {
          uid,
          amount: granted,
          reason: LEDGER_REASON.SPIN_REWARD,
          idempotencyKey: `daily_spin:${uid}:${windowKey}`,
          memo: `Daily spin (${granted})`,
        });
      }

      tx.set(
        userRef,
        {
          engagement: {
            ...engagement,
            lastDailySpinAt: ts,
            totalSpins: (engagement.totalSpins ?? 0) + 1,
          },
        },
        { merge: true },
      );

      return {
        ok: true,
        granted,
        prizeIndex,
        totalSpins: (engagement.totalSpins ?? 0) + 1,
        nextSpinAt: ts + DAILY_SPIN.COOLDOWN_MS,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to spin.');
  }
});
