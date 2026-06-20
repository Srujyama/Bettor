/**
 * openChest — the variable-reward "loot box" loop (slot-like dopamine on opens).
 *
 * PILOT ECONOMY / RTP NOTE: a chest is FREE once every CHEST.FREE_COOLDOWN_MS.
 * Inside that cooldown the player may still open a chest by paying CHEST.COST
 * Chips. The reward is rolled from the shared CHEST_TABLE via a server random
 * (rollChest). Expected value of a roll is ~Σ(weight·chips)/Σweight ≈ 308 Chips;
 * the paid cost (75) is well under EV so a PAID open is +EV to the player — this
 * is intentional: chests are a RETENTION reward, not a sink, and they are minted
 * from the house like any grant (CHEST_REWARD reason). The economy stays solvent
 * because chests are gated by the free cooldown + cost, and the house tracks the
 * (negative) mint balance for reconciliation.
 *
 * Idempotent per opening via the client idempotencyKey, namespaced by uid.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn, grantChips } from '../lib/ledger';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';
import { rollChest } from '../shared/engagement';
import { rng } from '../shared/casino';
import { newUlid } from '../shared/ids';
import { OpenChestPayloadSchema, EngagementStateSchema } from '../shared/schemas-markets';

/** Chest economics for the pilot (free cooldown + paid-open price). */
const CHEST = {
  FREE_COOLDOWN_MS: 4 * 60 * 60 * 1000, // a free chest every 4h
  COST: 75, // Chips to open an extra chest inside the cooldown
} as const;

export const openChest = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = OpenChestPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const ts = now();
      const engagement = EngagementStateSchema.partial().parse(user.engagement ?? {});
      const lastFree = (user.lastChestFreeAt as number | null) ?? null;
      const isFree = lastFree == null || ts - lastFree >= CHEST.FREE_COOLDOWN_MS;

      const balance = (user.chipsBalance as number) ?? 0;
      if (!isFree && balance < CHEST.COST) {
        throw new HttpsError(
          'failed-precondition',
          `Your free chest isn't ready — opening one now costs ${CHEST.COST} Chips.`,
        );
      }

      // Roll the reward from a server random, seeded per opening (auditable).
      const seed = `chest:${uid}:${payload.idempotencyKey}:${newUlid()}`;
      const reward = rollChest(rng(seed)());

      const groupKey = `chest:${uid}:${payload.idempotencyKey}`;

      if (isFree) {
        // Free chest: pure grant from the house.
        await grantChips(tx, {
          uid,
          amount: reward.chips,
          reason: LEDGER_REASON.CHEST_REWARD,
          idempotencyKey: `${groupKey}:reward`,
          memo: `Free chest (${reward.tier})`,
        });
      } else {
        // Paid chest: one atomic group debits the cost and credits the reward.
        await postLedgerTxn(tx, {
          idempotencyKey: `${groupKey}:paid`,
          txnGroupId: groupKey,
          legs: [
            {
              uid,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: CHEST.COST,
              reason: LEDGER_REASON.CHEST_REWARD,
              bucket: 'balance',
              memo: 'Chest open cost',
            },
            {
              uid,
              direction: LEDGER_DIRECTION.CREDIT,
              amount: reward.chips,
              reason: LEDGER_REASON.CHEST_REWARD,
              bucket: 'balance',
              memo: `Paid chest (${reward.tier})`,
            },
          ],
        });
      }

      tx.set(
        userRef,
        {
          ...(isFree ? { lastChestFreeAt: ts } : {}),
          engagement: {
            ...engagement,
            chestsOpened: (engagement.chestsOpened ?? 0) + 1,
          },
          lifetimeChestsOpened: FieldValue.increment(1),
        },
        { merge: true },
      );

      return {
        ok: true,
        tier: reward.tier,
        chips: reward.chips,
        free: isFree,
        cost: isFree ? 0 : CHEST.COST,
        nextFreeAt: (isFree ? ts : (lastFree ?? ts)) + CHEST.FREE_COOLDOWN_MS,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to open chest.');
  }
});
