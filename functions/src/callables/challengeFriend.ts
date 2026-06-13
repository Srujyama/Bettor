/**
 * challengeFriend — a 1-tap head-to-head. In ONE atomic transaction we compose
 * the existing create-bet + place-bet internals:
 *   1. Validate the friendship (an accepted friend edge must exist).
 *   2. Create a WINNER_TAKE_ALL bet with two outcomes ("me" / "them"), visible
 *      invite-only, creator-resolved.
 *   3. Auto-place (escrow) the CHALLENGER'S stake on the "me" outcome via the
 *      ledger (STAKE_ESCROW) — the friend accepts later by placing on "them".
 *   4. Notify the friend (non-financial feed + notification).
 *
 * Idempotent on the client-supplied idempotencyKey (a re-run returns the same
 * bet). The friend joins by calling the normal placeBet on the "them" outcome.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { pushFeedItem, pushNotification } from '../lib/notify';
import { ChallengeFriendPayloadSchema } from '../shared/schemas-ext';
import { makeId, makeShareCode } from '../shared/ids';
import {
  BET_CATEGORY,
  BET_STATUS,
  BET_TYPE,
  BET_VISIBILITY,
  ECONOMY,
  LEDGER_DIRECTION,
  LEDGER_REASON,
  MARKET_MODEL,
  RESOLUTION_MODE,
  STAKE,
} from '../shared/constants';
import { assertChips } from '../shared/money';

export const challengeFriend = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = ChallengeFriendPayloadSchema.parse(req.data);
    assertChips(payload.stake, 'stake');

    if (payload.friendUid === uid) {
      throw new HttpsError('invalid-argument', 'You cannot challenge yourself.');
    }
    if (payload.stake < STAKE.MIN) {
      throw new HttpsError('invalid-argument', `Minimum stake is ${STAKE.MIN} Chips.`);
    }
    if (payload.stake > STAKE.DEFAULT_MAX) {
      throw new HttpsError('invalid-argument', `Maximum stake is ${STAKE.DEFAULT_MAX} Chips.`);
    }

    const ts = now();
    if (payload.lockAt <= ts) {
      throw new HttpsError('invalid-argument', 'Lock time must be in the future.');
    }
    if (payload.resolveBy <= payload.lockAt) {
      throw new HttpsError('invalid-argument', 'Resolution deadline must be after the lock time.');
    }

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const friendEdgeRef = db.doc(paths.friend(uid, payload.friendUid));
      const friendRef = db.doc(paths.user(payload.friendUid));
      const [userSnap, friendEdgeSnap, friendSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(friendEdgeRef),
        tx.get(friendRef),
      ]);

      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      if (!friendEdgeSnap.exists || (friendEdgeSnap.data()?.status as string) !== 'accepted') {
        throw new HttpsError('failed-precondition', 'You can only challenge an accepted friend.');
      }
      if (!friendSnap.exists) throw new HttpsError('not-found', 'That friend no longer exists.');

      // Idempotency: a challenge bet with this key from this creator → return it.
      const dupSnap = await tx.get(
        db
          .collection(paths.bets())
          .where('creatorUid', '==', uid)
          .where('idempotencyKey', '==', payload.idempotencyKey)
          .limit(1),
      );
      if (!dupSnap.empty) {
        const existing = dupSnap.docs[0].data();
        return { ok: true, betId: existing.betId as string, replayed: true };
      }

      const balance = (user.chipsBalance as number) ?? 0;
      if (payload.stake > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this challenge.');
      }

      const betId = makeId('bet');
      const shareCode = makeShareCode();
      const outcomes = [
        { id: 'o1', label: payload.myOutcomeLabel, odds: null },
        { id: 'o2', label: payload.theirOutcomeLabel, odds: null },
      ];

      // ── Create the head-to-head bet (WINNER_TAKE_ALL, creator-resolved) ──
      tx.set(db.doc(paths.bet(betId)), {
        betId,
        creatorUid: uid,
        title: payload.title,
        description: '',
        category: BET_CATEGORY.SOCIAL,
        mediaPath: null,
        type: BET_TYPE.HEAD_TO_HEAD,
        outcomes,
        marketModel: MARKET_MODEL.WINNER_TAKE_ALL,
        stakeMode: 'fixed',
        fixedStakeAmount: payload.stake,
        minStake: payload.stake,
        maxStake: payload.stake,
        currency: 'CHIP',
        rakeBps: ECONOMY.RAKE_BPS,
        visibility: BET_VISIBILITY.INVITE_ONLY,
        groupId: null,
        status: BET_STATUS.OPEN,
        resolutionMode: RESOLUTION_MODE.CREATOR,
        resolverUid: uid,
        consensusThreshold: null,
        oracleRef: null,
        lockAt: payload.lockAt,
        resolveBy: payload.resolveBy,
        winningOutcomeId: null,
        proposedOutcomeId: null,
        poolTotal: payload.stake,
        poolByOutcome: { o1: payload.stake, o2: 0 },
        entryCount: 1,
        settlementId: null,
        createdAt: ts,
        lockedAt: null,
        resolvedAt: null,
        settledAt: null,
        disputeWindowEndsAt: null,
        idempotencyKey: payload.idempotencyKey,
        shareCode,
        tags: ['challenge'],
        creatorName: (user.displayName as string) ?? 'Player',
        creatorPhotoURL: (user.photoURL as string | null) ?? null,
        challengeFriendUid: payload.friendUid,
      });

      // ── Auto-place (escrow) the challenger's stake on the "me" outcome ──
      const ledgerRes = await postLedgerTxn(tx, {
        idempotencyKey: `place:${betId}:${uid}:${payload.idempotencyKey}`,
        txnGroupId: `place:${betId}:${uid}`,
        betId,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: payload.stake,
            reason: LEDGER_REASON.STAKE_ESCROW,
            bucket: 'escrow',
            memo: `Challenge stake on ${betId}`,
          },
        ],
      });

      tx.set(db.doc(paths.entry(betId, uid)), {
        uid,
        betId,
        outcomeId: 'o1',
        stake: payload.stake,
        status: 'placed',
        ledgerEntryIdEscrow: ledgerRes.posted[0]?.entryId ?? null,
        ledgerEntryIdPayout: null,
        payoutAmount: null,
        joinedAt: ts,
        displayName: (user.displayName as string) ?? 'Player',
        photoURL: (user.photoURL as string | null) ?? null,
      });

      // Roll the challenger's lifetime/RG-adjacent counter forward.
      tx.set(userRef, { lifetimeWagered: FieldValue.increment(payload.stake) }, { merge: true });

      // ── Notify the friend (non-financial) ──
      const batchNotif = db.batch();
      pushNotification(batchNotif, payload.friendUid, {
        type: 'bet_invite',
        title: 'You were challenged! ⚔️',
        body: `${(user.displayName as string) ?? 'A friend'} bet you ${payload.stake} Chips: ${payload.title}`,
        betId,
        deepLink: `chipd://bet/${betId}`,
      });
      pushFeedItem(batchNotif, payload.friendUid, {
        type: 'bet_created',
        actorUid: uid,
        actorName: (user.displayName as string) ?? 'A friend',
        actorPhotoURL: (user.photoURL as string | null) ?? null,
        betId,
        betTitle: payload.title,
        amount: payload.stake,
      });
      // The notification batch is independent of the money transaction; commit it
      // after the txn resolves (best-effort; failure here never affects the bet).
      void batchNotif.commit().catch((e) => console.error('[challengeFriend] notify failed', e));

      return { ok: true, betId, shareCode };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to send challenge.');
  }
});
