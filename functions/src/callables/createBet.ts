/**
 * createBet — validate the wizard payload, generate a betId + shareCode, and
 * write the bet doc as 'open' immediately (drafts are optional in v1). The
 * client NEVER writes bets directly; this is the only creation path. Idempotent
 * on the supplied idempotencyKey.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { CreateBetPayloadSchema } from '../shared/schemas';
import { makeId, makeShareCode } from '../shared/ids';
import {
  BET_CATEGORY,
  BET_STATUS,
  BET_VISIBILITY,
  ECONOMY,
  MARKET_MODEL,
  RESOLUTION_MODE,
  STAKE,
} from '../shared/constants';

export const createBet = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateBetPayloadSchema.parse(req.data);

    // Time windows: must lock in the future and resolve after locking.
    const ts = now();
    if (payload.lockAt <= ts) {
      throw new HttpsError('invalid-argument', 'Lock time must be in the future.');
    }
    if (payload.resolveBy <= payload.lockAt) {
      throw new HttpsError('invalid-argument', 'Resolution deadline must be after the lock time.');
    }

    // Outcomes (2–12) with unique stable ids.
    if (payload.outcomes.length < 2 || payload.outcomes.length > 12) {
      throw new HttpsError('invalid-argument', 'A bet needs between 2 and 12 outcomes.');
    }

    // Stake bounds.
    const minStake = payload.minStake ?? STAKE.MIN;
    const maxStake = payload.maxStake ?? null;
    if (minStake < STAKE.MIN) {
      throw new HttpsError('invalid-argument', `Minimum stake is ${STAKE.MIN} Chips.`);
    }
    if (maxStake != null) {
      if (maxStake > STAKE.ABSOLUTE_MAX) {
        throw new HttpsError('invalid-argument', `Maximum stake cannot exceed ${STAKE.ABSOLUTE_MAX} Chips.`);
      }
      if (maxStake < minStake) {
        throw new HttpsError('invalid-argument', 'Maximum stake must be at least the minimum stake.');
      }
    }

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      // Idempotency: if a bet with this key already exists for this creator, return it.
      const dupSnap = await tx.get(
        db
          .collection(paths.bets())
          .where('creatorUid', '==', uid)
          .where('idempotencyKey', '==', payload.idempotencyKey)
          .limit(1),
      );
      if (!dupSnap.empty) {
        const existing = dupSnap.docs[0].data();
        return { ok: true, betId: existing.betId as string, shareCode: existing.shareCode as string, replayed: true };
      }

      const betId = makeId('bet');
      const shareCode = makeShareCode();
      const outcomes = payload.outcomes.map((o, i) => ({
        id: `o${i + 1}`,
        label: o.label,
        odds: o.odds ?? null,
      }));
      const poolByOutcome: Record<string, number> = {};
      for (const o of outcomes) poolByOutcome[o.id] = 0;

      const resolutionMode = payload.resolutionMode ?? RESOLUTION_MODE.CREATOR;

      const bet = {
        betId,
        creatorUid: uid,
        title: payload.title,
        description: payload.description ?? '',
        category: payload.category ?? BET_CATEGORY.CUSTOM,
        mediaPath: payload.mediaPath ?? null,
        type: payload.type,
        outcomes,
        marketModel: payload.marketModel ?? MARKET_MODEL.PARI_MUTUEL,
        stakeMode: payload.stakeMode ?? 'open',
        fixedStakeAmount: payload.fixedStakeAmount ?? null,
        minStake,
        maxStake,
        currency: 'CHIP',
        rakeBps: ECONOMY.RAKE_BPS,
        visibility: payload.visibility ?? BET_VISIBILITY.FRIENDS,
        groupId: payload.groupId ?? null,
        status: BET_STATUS.OPEN,
        resolutionMode,
        resolverUid: resolutionMode === RESOLUTION_MODE.CREATOR ? uid : null,
        consensusThreshold: payload.consensusThreshold ?? (resolutionMode === RESOLUTION_MODE.CONSENSUS ? 0.6 : null),
        oracleRef: null,
        lockAt: payload.lockAt,
        resolveBy: payload.resolveBy,
        winningOutcomeId: null,
        proposedOutcomeId: null,
        poolTotal: 0,
        poolByOutcome,
        entryCount: 0,
        settlementId: null,
        createdAt: ts,
        lockedAt: null,
        resolvedAt: null,
        settledAt: null,
        disputeWindowEndsAt: null,
        idempotencyKey: payload.idempotencyKey,
        shareCode,
        tags: payload.tags ?? [],
        creatorName: (user.displayName as string) ?? 'Player',
        creatorPhotoURL: (user.photoURL as string | null) ?? null,
      };

      tx.set(db.doc(paths.bet(betId)), bet);
      return { ok: true, betId, shareCode };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create bet.');
  }
});
