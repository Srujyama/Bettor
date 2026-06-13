/**
 * placeBet — THE money-in path. One atomic transaction:
 *   re-read bet (must be 'open' & now < lockAt) → re-read user balance →
 *   assert stake within [minStake, maxStake||DEFAULT_MAX], <= available balance,
 *   within RG daily/weekly + bet-count limits → debit balance into escrow via
 *   the ledger (STAKE_ESCROW) → create entries/{uid} → bump pool counters →
 *   update the user's RG counters. One entry per uid (docId = uid). Idempotent.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { assertWithinRgLimits, readRg, rolledRgState } from '../lib/rg';
import { PlaceBetPayloadSchema } from '../shared/schemas';
import { acceptsEntries } from '../shared/betStateMachine';
import { LEDGER_DIRECTION, LEDGER_REASON, STAKE } from '../shared/constants';
import { assertChips } from '../shared/money';

export const placeBet = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = PlaceBetPayloadSchema.parse(req.data);
    assertChips(payload.stake, 'stake');

    return await db.runTransaction(async (tx) => {
      const betRef = db.doc(paths.bet(payload.betId));
      const entryRef = db.doc(paths.entry(payload.betId, uid));
      const userRef = db.doc(paths.user(uid));

      // ── All reads first (Firestore txn rule) ──
      const [betSnap, entrySnap, userSnap] = await Promise.all([
        tx.get(betRef),
        tx.get(entryRef),
        tx.get(userRef),
      ]);

      if (!betSnap.exists) throw new HttpsError('not-found', 'Bet not found.');
      const bet = betSnap.data()!;
      const ts = now();

      if (!acceptsEntries(bet.status as never) || ts >= (bet.lockAt as number)) {
        throw new HttpsError('failed-precondition', 'This bet is no longer accepting entries.');
      }
      if (entrySnap.exists) {
        // One entry per user. Treat a same-stake/outcome retry as idempotent success.
        const existing = entrySnap.data()!;
        return {
          ok: true,
          entryId: uid,
          newBalance: (userSnap.data()?.chipsBalance as number) ?? 0,
          alreadyPlaced: true,
          outcomeId: existing.outcomeId,
        };
      }

      const outcomes = (bet.outcomes as { id: string }[]) ?? [];
      if (!outcomes.some((o) => o.id === payload.outcomeId)) {
        throw new HttpsError('invalid-argument', 'Unknown outcome for this bet.');
      }

      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      // Stake bounds.
      const minStake = (bet.minStake as number) ?? STAKE.MIN;
      const maxStake = (bet.maxStake as number | null) ?? STAKE.DEFAULT_MAX;
      if (bet.stakeMode === 'fixed' && bet.fixedStakeAmount != null) {
        if (payload.stake !== bet.fixedStakeAmount) {
          throw new HttpsError('invalid-argument', `This bet requires a fixed stake of ${bet.fixedStakeAmount} Chips.`);
        }
      }
      if (payload.stake < minStake) {
        throw new HttpsError('invalid-argument', `Minimum stake is ${minStake} Chips.`);
      }
      if (payload.stake > maxStake) {
        throw new HttpsError('invalid-argument', `Maximum stake is ${maxStake} Chips.`);
      }

      // Available balance.
      const balance = (user.chipsBalance as number) ?? 0;
      if (payload.stake > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this stake.');
      }

      // Responsible-gaming limits (roll counters forward first).
      const { state, limits } = readRg(user);
      const rolled = rolledRgState(state, ts);
      assertWithinRgLimits(rolled, limits, payload.stake);

      // ── Writes ──
      // Escrow: balance → held (DEBIT on the balance bucket).
      // Namespace the client-supplied idempotency key by bet + uid so a reused
      // or guessed key from a DIFFERENT user can never be mistaken for a replay
      // of this user's escrow (defense against cross-user key collision).
      const ledgerRes = await postLedgerTxn(tx, {
        idempotencyKey: `place:${payload.betId}:${uid}:${payload.idempotencyKey}`,
        txnGroupId: `place:${payload.betId}:${uid}`,
        betId: payload.betId,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: payload.stake,
            reason: LEDGER_REASON.STAKE_ESCROW,
            bucket: 'escrow',
            memo: `Stake on bet ${payload.betId}`,
          },
        ],
      });
      const escrowEntryId = ledgerRes.posted[0]?.entryId ?? payload.idempotencyKey;
      const newBalance = ledgerRes.posted[0]?.balanceAfter ?? balance - payload.stake;

      // Create the entry doc (docId == uid).
      tx.set(entryRef, {
        uid,
        betId: payload.betId,
        outcomeId: payload.outcomeId,
        stake: payload.stake,
        status: 'placed',
        ledgerEntryIdEscrow: escrowEntryId,
        ledgerEntryIdPayout: null,
        payoutAmount: null,
        joinedAt: ts,
        displayName: (user.displayName as string) ?? 'Player',
        photoURL: (user.photoURL as string | null) ?? null,
      });

      // Bump pool counters on the bet.
      tx.set(
        betRef,
        {
          poolTotal: FieldValue.increment(payload.stake),
          [`poolByOutcome.${payload.outcomeId}`]: FieldValue.increment(payload.stake),
          entryCount: FieldValue.increment(1),
        },
        { merge: true },
      );

      // Update the user's RG counters + lifetime wagered.
      tx.set(
        userRef,
        {
          rgState: {
            todayStaked: rolled.todayStaked + payload.stake,
            weekStaked: rolled.weekStaked + payload.stake,
            todayBetCount: rolled.todayBetCount + 1,
            lastResetAt: rolled.lastResetAt,
          },
          lifetimeWagered: FieldValue.increment(payload.stake),
        },
        { merge: true },
      );

      return { ok: true, entryId: uid, newBalance };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to place bet.');
  }
});
