/**
 * createBetFromFixture — open a bet PRE-LINKED to a sports fixture so it can
 * auto-resolve from the oracle. Composes with the same bet doc shape that
 * createBet writes: outcomes are the two teams (Home / Away, plus Draw when the
 * league allows ties), and the bet carries an `oracleRef` pointing at the
 * fixture + a winner→outcome map. The scheduled `oracleResolve` later reads that
 * ref and sets `winningOutcomeId` automatically. The client NEVER writes bets
 * directly — this is the only fixture-linked creation path. Idempotent on the
 * supplied idempotencyKey.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { makeId, makeShareCode } from '../shared/ids';
import {
  BET_CATEGORY,
  BET_STATUS,
  BET_TYPE,
  BET_VISIBILITY,
  ECONOMY,
  MARKET_MODEL,
  RESOLUTION_MODE,
  STAKE,
} from '../shared/constants';
import { encodeFixtureOracleRef, type FixtureWinner } from '../sports/oracleRef';

/**
 * Payload. Matches the client wrapper in src/lib/firebase/functions.ts
 * (`{ fixtureId, market, stake?, lockAt?, idempotencyKey }`) plus a few optional
 * tuning fields, and is lenient about extras so the two stay loosely coupled.
 *
 *  - `market`      a short label describing the bet ("Match Winner"); becomes the
 *                  bet title's market hint when no explicit title is given.
 *  - `stake`       optional fixed stake → fixed-stake bet.
 *  - `lockAt`      optional explicit lock time; otherwise we lock at kickoff.
 */
const CreateBetFromFixturePayloadSchema = z.object({
  fixtureId: z.string(),
  market: z.string().min(1).max(60).optional(),
  /** Optional override title; defaults to "Home vs Away". */
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(500).optional(),
  /** Include a Draw outcome (only valid when the fixture's sport allows ties). */
  includeDraw: z.boolean().optional(),
  /** A fixed stake makes the bet fixed-stake; omit for an open-stake pool. */
  stake: z.number().int().positive().nullable().optional(),
  lockAt: z.number().int().nonnegative().optional(),
  minStake: z.number().int().nonnegative().optional(),
  maxStake: z.number().int().nonnegative().nullable().optional(),
  visibility: z
    .enum([
      BET_VISIBILITY.PUBLIC,
      BET_VISIBILITY.FRIENDS,
      BET_VISIBILITY.INVITE_ONLY,
      BET_VISIBILITY.GROUP,
    ])
    .optional(),
  groupId: z.string().nullable().optional(),
  idempotencyKey: z.string(),
});

export const createBetFromFixture = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateBetFromFixturePayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const fixtureRef = db.doc(paths.fixture(payload.fixtureId));
      const [userSnap, fixtureSnap] = await Promise.all([tx.get(userRef), tx.get(fixtureRef)]);

      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      if (!fixtureSnap.exists) {
        throw new HttpsError('not-found', 'That game is no longer available.');
      }
      const fixture = fixtureSnap.data()!;
      const status = fixture.status as string;
      if (status === 'final') {
        throw new HttpsError('failed-precondition', 'That game has already finished.');
      }

      const startsAt = fixture.startsAt as number;
      const ts = now();
      // Lock at the requested time, else at kickoff (or 1 minute out if the game
      // is already live, so the bet can still be created for a just-started
      // match). Resolve well after.
      const defaultLock = startsAt > ts ? startsAt : ts + 60_000;
      const lockAt = payload.lockAt && payload.lockAt > ts ? payload.lockAt : defaultLock;
      const resolveBy = startsAt + 6 * 60 * 60 * 1000; // 6h after kickoff

      // Idempotency: a fixture-linked bet with this key already exists → return it.
      const dupSnap = await tx.get(
        db
          .collection(paths.bets())
          .where('creatorUid', '==', uid)
          .where('idempotencyKey', '==', payload.idempotencyKey)
          .limit(1),
      );
      if (!dupSnap.empty) {
        const existing = dupSnap.docs[0].data();
        return {
          ok: true,
          betId: existing.betId as string,
          shareCode: existing.shareCode as string,
          replayed: true,
        };
      }

      const homeTeam = fixture.homeTeam as string;
      const awayTeam = fixture.awayTeam as string;
      const drawsPossible = fixture.sport === 'football' || fixture.sport === 'soccer';
      const includeDraw = payload.includeDraw === true && drawsPossible;

      // Outcomes: o1 = home, o2 = away, (o3 = draw). Stable ids mirror createBet.
      const outcomes: { id: string; label: string; odds: number | null }[] = [
        { id: 'o1', label: homeTeam, odds: null },
        { id: 'o2', label: awayTeam, odds: null },
      ];
      if (includeDraw) outcomes.push({ id: 'o3', label: 'Draw', odds: null });

      const outcomeByWinner: Partial<Record<FixtureWinner, string>> = {
        home: 'o1',
        away: 'o2',
        ...(includeDraw ? { draw: 'o3' } : {}),
      };

      const poolByOutcome: Record<string, number> = {};
      for (const o of outcomes) poolByOutcome[o.id] = 0;

      const fixedStakeAmount = payload.stake ?? null;
      const stakeMode: 'fixed' | 'open' = fixedStakeAmount != null ? 'fixed' : 'open';
      const minStake = fixedStakeAmount != null ? fixedStakeAmount : payload.minStake ?? STAKE.MIN;
      const maxStake = fixedStakeAmount != null ? fixedStakeAmount : payload.maxStake ?? null;
      if (minStake < STAKE.MIN) {
        throw new HttpsError('invalid-argument', `Minimum stake is ${STAKE.MIN} Chips.`);
      }
      if (maxStake != null && maxStake < minStake) {
        throw new HttpsError('invalid-argument', 'Maximum stake must be at least the minimum stake.');
      }

      const betId = makeId('bet');
      const shareCode = makeShareCode();
      const oracleRef = encodeFixtureOracleRef({ fixtureId: payload.fixtureId, outcomeByWinner });

      const bet = {
        betId,
        creatorUid: uid,
        title: payload.title ?? `${homeTeam} vs ${awayTeam}`,
        description:
          payload.description ??
          `${fixture.league}${payload.market ? ` · ${payload.market}` : ''} · auto-resolves from the final score.`,
        category: BET_CATEGORY.SPORTS,
        mediaPath: null,
        type: includeDraw ? BET_TYPE.MULTI : BET_TYPE.HEAD_TO_HEAD,
        outcomes,
        marketModel: MARKET_MODEL.PARI_MUTUEL,
        stakeMode,
        fixedStakeAmount,
        minStake,
        maxStake,
        currency: 'CHIP',
        rakeBps: ECONOMY.RAKE_BPS,
        visibility: payload.visibility ?? BET_VISIBILITY.PUBLIC,
        groupId: payload.groupId ?? null,
        status: BET_STATUS.OPEN,
        // Oracle-resolved: oracleResolve proposes the winner; creator can still
        // dispute. resolverUid stays the creator as a human fallback.
        resolutionMode: RESOLUTION_MODE.ORACLE,
        resolverUid: uid,
        consensusThreshold: null,
        oracleRef,
        lockAt,
        resolveBy,
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
        tags: [fixture.league as string, fixture.sport as string],
        // Sports denormalization for cards.
        fixtureId: payload.fixtureId,
        creatorName: (user.displayName as string) ?? 'Player',
        creatorPhotoURL: (user.photoURL as string | null) ?? null,
      };

      tx.set(db.doc(paths.bet(betId)), bet);
      return { ok: true, betId, shareCode };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create bet from fixture.');
  }
});
