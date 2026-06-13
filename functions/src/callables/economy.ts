/**
 * Economy & cosmetics callables — the money paths for the shop, power-ups, the
 * Pro tier, and in-bet gifting. Compliance: everything is bought with CHIPS
 * only (no real money), cosmetics are cosmetic-ONLY (never alter a bet outcome),
 * and power-ups touch only the virtual Chip economy. All Chip movement flows
 * through the double-entry ledger so Chips are conserved and audited.
 *
 * Inventory / equipped / pro / powerups are written ONLY here (CF-write); the
 * client reads them back through the live hooks. The user-doc denormalized
 * fields (`equipped`, `pro`, `powerups`) are in the rules' CF-only forbidden set.
 *
 * Power-up application is implemented WITHOUT editing the base settlement engine
 * (settle.ts): `applyPowerUp` records the power-up on the user's entry, and the
 * post-settlement trigger `onBetSettledPowerUps` posts the compensating
 * insurance refund / double-or-nothing bonus from the house via POWERUP_PAYOUT.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { acceptsEntries } from '../shared/betStateMachine';
import { COSMETIC_BY_KEY, POWERUP_BY_KEY, PRO } from '../shared/gamification';
import {
  BuyCosmeticPayloadSchema,
  EquipCosmeticPayloadSchema,
  BuyPowerUpPayloadSchema,
  SubscribeProPayloadSchema,
} from '../shared/schemas-ext';
import { HOUSE_UID, LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';
import { makeId } from '../shared/ids';
import { z } from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Server-only path helpers for collections this track owns (kept inline so we
 * never collide with another track's edits to lib/paths.ts). */
const inventoryItem = (uid: string, itemId: string) => `${paths.user(uid)}/inventory/${itemId}`;
const inventoryCol = (uid: string) => `${paths.user(uid)}/inventory`;

// ─── buyCosmetic ────────────────────────────────────────────────────────────

/**
 * Buy a cosmetic with Chips. Rejects if already owned or if it is proOnly and
 * the buyer is not an active Pro. Debits the price (SHOP_PURCHASE) to the house
 * and writes an inventory item. Idempotent: the inventory docId is derived from
 * the cosmetic key, so a retry is a no-op.
 */
export const buyCosmetic = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { cosmeticKey } = BuyCosmeticPayloadSchema.parse(req.data);

    const cosmetic = COSMETIC_BY_KEY[cosmeticKey];
    if (!cosmetic) throw new HttpsError('not-found', 'Unknown cosmetic.');

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      // Deterministic inventory id → one row per cosmetic per user → idempotent.
      const itemId = `cos_${cosmeticKey}`;
      const itemRef = db.doc(inventoryItem(uid, itemId));

      const [userSnap, itemSnap] = await Promise.all([tx.get(userRef), tx.get(itemRef)]);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      if (itemSnap.exists) {
        // Already owned — idempotent success.
        return { ok: true, itemId, cosmeticKey, alreadyOwned: true };
      }

      const ts = now();
      const proActive =
        user.pro?.active === true && (user.pro?.expiresAt == null || (user.pro.expiresAt as number) > ts);
      if (cosmetic.proOnly && !proActive) {
        throw new HttpsError('failed-precondition', 'This item is exclusive to Pro members.');
      }

      const balance = (user.chipsBalance as number) ?? 0;
      if (cosmetic.price > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this purchase.');
      }

      // Debit the buyer, credit the house (the shop is a Chip sink/source).
      await postLedgerTxn(tx, {
        idempotencyKey: `buy_cosmetic:${uid}:${cosmeticKey}`,
        txnGroupId: `buy_cosmetic:${uid}:${cosmeticKey}`,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: cosmetic.price,
            reason: LEDGER_REASON.SHOP_PURCHASE,
            bucket: 'balance',
            memo: `Bought ${cosmetic.name}`,
          },
          {
            uid: HOUSE_UID,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: cosmetic.price,
            reason: LEDGER_REASON.SHOP_PURCHASE,
            bucket: 'balance',
            memo: `Shop sale: ${cosmetic.name}`,
          },
        ],
      });

      tx.set(itemRef, {
        itemId,
        cosmeticKey,
        type: cosmetic.type,
        acquiredAt: ts,
        equipped: false,
      });

      return { ok: true, itemId, cosmeticKey };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to buy cosmetic.');
  }
});

// ─── equipCosmetic ──────────────────────────────────────────────────────────

/**
 * Equip (or unequip with cosmeticKey=null) a cosmetic of a given slot type.
 * Requires ownership. Sets `users/{uid}.equipped[type]` and toggles the
 * `equipped` flag on the inventory rows of that slot. Moves NO money.
 */
export const equipCosmetic = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { type, cosmeticKey } = EquipCosmeticPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));

      // Reads first (txn rule). We need the user + the inventory rows of this slot.
      const slotQuery = db.collection(inventoryCol(uid)).where('type', '==', type);
      const [userSnap, slotSnap] = await Promise.all([tx.get(userRef), tx.get(slotQuery)]);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      if (cosmeticKey !== null) {
        const cosmetic = COSMETIC_BY_KEY[cosmeticKey];
        if (!cosmetic) throw new HttpsError('not-found', 'Unknown cosmetic.');
        if (cosmetic.type !== type) {
          throw new HttpsError('invalid-argument', 'Cosmetic does not match the requested slot.');
        }
        const owned = slotSnap.docs.some((d) => (d.data().cosmeticKey as string) === cosmeticKey);
        if (!owned) throw new HttpsError('failed-precondition', 'You do not own this item.');
      }

      // Flip the equipped flag on every row of this slot.
      for (const d of slotSnap.docs) {
        const isTarget = cosmeticKey !== null && (d.data().cosmeticKey as string) === cosmeticKey;
        if ((d.data().equipped as boolean) !== isTarget) {
          tx.set(d.ref, { equipped: isTarget }, { merge: true });
        }
      }

      tx.set(userRef, { equipped: { [type]: cosmeticKey } }, { merge: true });

      return { ok: true, type, cosmeticKey };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to equip cosmetic.');
  }
});

// ─── buyPowerUp ─────────────────────────────────────────────────────────────

/**
 * Buy `count` of a power-up. Debits price*count (POWERUP_USE) to the house and
 * increments `users/{uid}.powerups[key]`. Power-ups affect only the virtual
 * Chip economy and are disclosed in the shop UI.
 */
export const buyPowerUp = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { key, count } = BuyPowerUpPayloadSchema.parse(req.data);

    const powerup = POWERUP_BY_KEY[key];
    if (!powerup) throw new HttpsError('not-found', 'Unknown power-up.');

    const cost = powerup.price * count;

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      const balance = (user.chipsBalance as number) ?? 0;
      if (cost > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this purchase.');
      }

      await postLedgerTxn(tx, {
        // Unique per purchase (count of power-ups can be re-bought), keyed by a fresh id.
        idempotencyKey: `buy_powerup:${uid}:${key}:${makeId()}`,
        txnGroupId: `buy_powerup:${uid}:${key}`,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: cost,
            reason: LEDGER_REASON.POWERUP_USE,
            bucket: 'balance',
            memo: `Bought ${count}× ${powerup.name}`,
          },
          {
            uid: HOUSE_UID,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: cost,
            reason: LEDGER_REASON.POWERUP_USE,
            bucket: 'balance',
            memo: `Power-up sale: ${count}× ${powerup.name}`,
          },
        ],
      });

      tx.set(userRef, { powerups: { [key]: FieldValue.increment(count) } }, { merge: true });

      const newCount = ((user.powerups?.[key] as number) ?? 0) + count;
      return { ok: true, key, count: newCount };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to buy power-up.');
  }
});

// ─── subscribePro ─────────────────────────────────────────────────────────────

/**
 * Subscribe to (or renew) Pro for one PERIOD with Chips. Debits PRO.PRICE_CHIPS
 * (PRO_SUBSCRIPTION) to the house and sets `users/{uid}.pro`. Renewing while
 * still active extends from the current expiry; otherwise from now. Pro is
 * cosmetic/convenience tier — never pay-to-win on a bet outcome. The scheduled
 * `expirePro` sweep flips `active=false` once `expiresAt` passes.
 */
export const subscribePro = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    SubscribeProPayloadSchema.parse(req.data ?? {});

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: false });

      const ts = now();
      const balance = (user.chipsBalance as number) ?? 0;
      if (PRO.PRICE_CHIPS > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for Pro.');
      }

      const periodMs = PRO.PERIOD_DAYS * DAY_MS;
      const currentlyActive =
        user.pro?.active === true && (user.pro?.expiresAt as number | null) != null && (user.pro.expiresAt as number) > ts;
      const base = currentlyActive ? (user.pro.expiresAt as number) : ts;
      const expiresAt = base + periodMs;
      const since = currentlyActive ? ((user.pro.since as number | null) ?? ts) : ts;

      await postLedgerTxn(tx, {
        // One subscription per (uid, expiry window) so a double-tap can't double-charge.
        idempotencyKey: `pro_sub:${uid}:${expiresAt}`,
        txnGroupId: `pro_sub:${uid}`,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: PRO.PRICE_CHIPS,
            reason: LEDGER_REASON.PRO_SUBSCRIPTION,
            bucket: 'balance',
            memo: `Pro (${PRO.PERIOD_DAYS}d)`,
          },
          {
            uid: HOUSE_UID,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: PRO.PRICE_CHIPS,
            reason: LEDGER_REASON.PRO_SUBSCRIPTION,
            bucket: 'balance',
            memo: `Pro subscription for ${uid}`,
          },
        ],
      });

      tx.set(userRef, { pro: { active: true, since, expiresAt } }, { merge: true });

      return { ok: true, active: true, since, expiresAt };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to subscribe to Pro.');
  }
});

// ─── applyPowerUp (records a power-up on the user's entry) ────────────────────

const ApplyPowerUpPayloadSchema = z.object({
  betId: z.string(),
  key: z.enum(['insurance', 'double']),
});

/**
 * Apply a placement power-up to the caller's existing entry on an open bet,
 * consuming one from inventory. This is the cleanest seam that does NOT touch
 * the base placeBet/settle code: it stamps `powerUp` on `entries/{uid}`, and the
 * post-settlement trigger (`onBetSettledPowerUps`) honors it with a compensating
 * POWERUP_PAYOUT from the house. Moves NO money at apply time (the power-up was
 * already paid for at purchase).
 *
 * - 'insurance' refunds half the stake if the entry LOSES.
 * - 'double' pays a bonus equal to the profit again if the entry WINS.
 *
 * Only one power-up per entry. Must apply before the bet locks.
 */
export const applyPowerUp = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { betId, key } = ApplyPowerUpPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const betRef = db.doc(paths.bet(betId));
      const entryRef = db.doc(paths.entry(betId, uid));

      const [userSnap, betSnap, entrySnap] = await Promise.all([
        tx.get(userRef),
        tx.get(betRef),
        tx.get(entryRef),
      ]);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;
      const ts = now();
      if (!acceptsEntries(bet.status as never) || ts >= (bet.lockAt as number)) {
        throw new HttpsError('failed-precondition', 'This bet is locked; power-ups must be applied before lock.');
      }
      if (!entrySnap.exists) throw new HttpsError('failed-precondition', 'Place a stake before applying a power-up.');
      const entry = entrySnap.data()!;
      if (entry.powerUp != null) {
        if ((entry.powerUp as { key: string }).key === key) {
          return { ok: true, betId, key, alreadyApplied: true };
        }
        throw new HttpsError('failed-precondition', 'A power-up is already applied to this entry.');
      }

      const owned = (user.powerups?.[key] as number) ?? 0;
      if (owned < 1) throw new HttpsError('failed-precondition', `You have no ${key} power-ups. Buy one first.`);

      // Consume one and stamp the entry.
      tx.set(userRef, { powerups: { [key]: FieldValue.increment(-1) } }, { merge: true });
      tx.set(
        entryRef,
        { powerUp: { key, appliedAt: ts, resolved: false } },
        { merge: true },
      );

      return { ok: true, betId, key };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to apply power-up.');
  }
});

// ─── giftIntoBet (compliance-safe co-bet) ─────────────────────────────────────

const GiftIntoBetPayloadSchema = z.object({
  betId: z.string(),
  recipientUid: z.string(),
  amount: z.number().int().positive(),
});

/**
 * Gift Chips to a friend STRICTLY inside the bet mechanic (a "co-bet"): the
 * gifter pays the stake and the recipient gets an escrowed entry on the SAME
 * SIDE the recipient already backs (or the recipient must already be in the
 * bet). Chips only ever move INTO a bet pool — never peer-to-peer cash-out — so
 * there is no money transmission: the gift is a stake the recipient could have
 * placed themselves. Compliance rationale: this is functionally identical to
 * topping up the recipient's escrow on a bet they are a participant in; nothing
 * leaves the closed virtual economy and the pool stays conserved.
 *
 * Mechanic: gifter balance → recipient escrow (held) on the recipient's entry,
 * recorded as GIFT_SENT (gifter debit) / GIFT_RECEIVED (recipient escrow). The
 * recipient's stake and the bet pool increase; the gifter receives nothing back.
 */
export const giftIntoBet = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const { betId, recipientUid, amount } = GiftIntoBetPayloadSchema.parse(req.data);

    if (recipientUid === uid) {
      throw new HttpsError('invalid-argument', 'Top up your own stake by placing more directly.');
    }

    return await db.runTransaction(async (tx) => {
      const gifterRef = db.doc(paths.user(uid));
      const betRef = db.doc(paths.bet(betId));
      const recipientEntryRef = db.doc(paths.entry(betId, recipientUid));

      const [gifterSnap, betSnap, recipientEntrySnap] = await Promise.all([
        tx.get(gifterRef),
        tx.get(betRef),
        tx.get(recipientEntryRef),
      ]);
      const gifter = gifterSnap.data();
      assertUserAllowed(gifter, { requireAge: true });

      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;
      const ts = now();
      if (!acceptsEntries(bet.status as never) || ts >= (bet.lockAt as number)) {
        throw new HttpsError('failed-precondition', 'This bet is no longer accepting Chips.');
      }
      // The recipient must already be a participant — we only ever top up an
      // existing escrowed entry, keeping the gift strictly inside the bet.
      if (!recipientEntrySnap.exists) {
        throw new HttpsError('failed-precondition', 'Your friend must join this bet before you can back them.');
      }
      const recipientEntry = recipientEntrySnap.data()!;
      if ((recipientEntry.status as string) !== 'placed') {
        throw new HttpsError('failed-precondition', 'That entry is not open for a co-bet.');
      }

      const balance = (gifter.chipsBalance as number) ?? 0;
      if (amount > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this gift.');
      }

      const outcomeId = recipientEntry.outcomeId as string;

      // Three conserved legs keep the gift strictly inside the bet:
      //   1) gifter DEBIT balance               (GIFT_SENT)
      //   2) recipient CREDIT balance           (GIFT_RECEIVED)  — momentary
      //   3) recipient escrow: DEBIT balance → held (STAKE_ESCROW)
      // Net effect: gifter balance −amount, recipient held +amount, recipient
      // balance unchanged. The Chips land as escrowed stake on the recipient's
      // existing entry — never as spendable, peer-to-peer cash.
      await postLedgerTxn(tx, {
        idempotencyKey: `gift:${betId}:${uid}:${recipientUid}:${makeId()}`,
        txnGroupId: `gift:${betId}:${uid}:${recipientUid}`,
        betId,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount,
            reason: LEDGER_REASON.GIFT_SENT,
            bucket: 'balance',
            memo: `Backed ${recipientUid} on bet ${betId}`,
          },
          {
            uid: recipientUid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount,
            reason: LEDGER_REASON.GIFT_RECEIVED,
            bucket: 'balance',
            memo: `Co-bet from ${uid} on bet ${betId}`,
          },
          {
            uid: recipientUid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount,
            reason: LEDGER_REASON.STAKE_ESCROW,
            bucket: 'escrow',
            memo: `Co-bet escrowed on bet ${betId}`,
          },
        ],
      });

      // Top up the recipient's escrowed stake + the bet pool counters.
      tx.set(
        recipientEntryRef,
        {
          stake: FieldValue.increment(amount),
          giftedTotal: FieldValue.increment(amount),
        },
        { merge: true },
      );
      tx.set(
        betRef,
        {
          poolTotal: FieldValue.increment(amount),
          [`poolByOutcome.${outcomeId}`]: FieldValue.increment(amount),
        },
        { merge: true },
      );

      return { ok: true, betId, recipientUid, amount };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to send co-bet.');
  }
});
