/**
 * playGame — ONE callable for all five casino mini-games (slots, wheel, scratch,
 * coinflip, crash). The server is the sole authority on the outcome: the client
 * sends a stake + clientSeed (+ game params) and reads back a provably-fair
 * result it can verify after the fact.
 *
 * One atomic transaction:
 *   re-read user → assert age/RG/region + stake bounds + balance → commit a fresh
 *   serverSeed (store its sha256 hash) → derive the outcome from the shared,
 *   audited casino fn using seedString(serverSeed, clientSeed, nonce) → debit the
 *   stake to the house (GAME_WAGER) → if the round wins, credit the payout from
 *   the house (GAME_PAYOUT) → persist users/{uid}/gameRounds/{roundId} with the
 *   result blob + serverSeedHash + (revealed) serverSeed + clientSeed + nonce.
 *
 * Money only moves through the double-entry ledger, so Chips stay conserved (the
 * house is the mint/sink). The whole post is idempotent on the client-supplied
 * idempotencyKey, namespaced by uid so a guessed key can't replay a stranger's
 * round. RTP < 1 for every game (verified in the shared module tests), so the
 * economy stays solvent.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn, type LedgerLeg } from '../lib/ledger';
import { assertWithinRgLimits, readRg, rolledRgState } from '../lib/rg';
import { newCommitment } from '../games/fair';
import { PlayGamePayloadSchema } from '../shared/schemas-markets';
import { HOUSE_UID, LEDGER_DIRECTION, LEDGER_REASON, STAKE } from '../shared/constants';
import { assertChips } from '../shared/money';
import {
  seedString,
  coinFlip,
  spinSlots,
  spinWheel,
  scratchCard,
  resolveCrash,
  gamePayout,
} from '../shared/casino';

/** Per-game wager ceiling (well under the global ABSOLUTE_MAX). */
const GAME_MAX_STAKE = 5_000;

/** Inline path builders (kept local so we never collide with another track's
 *  edits to lib/paths.ts — the Markets track owns the shared additions). */
const gameRoundDoc = (uid: string, roundId: string) => `${paths.user(uid)}/gameRounds/${roundId}`;
const discoveryItemDoc = (itemId: string) => `discovery/${itemId}`;

type Game = 'slots' | 'wheel' | 'scratch' | 'coinflip' | 'crash';

interface GameOutcome {
  multiplier: number;
  /** Persisted to the round so the client can replay/verify the animation target. */
  result: Record<string, unknown>;
}

/** Map a game + seed string (+ params) → its multiplier and a serializable result blob. */
function computeOutcome(game: Game, seedStr: string, params: Record<string, unknown>): GameOutcome {
  switch (game) {
    case 'coinflip': {
      const pick = params.pick === 'tails' ? 'tails' : 'heads';
      const flip = coinFlip(seedStr, pick);
      // Win pays the coinflip multiplier; loss pays 0.
      const multiplier = flip.won ? 1.96 : 0;
      return { multiplier, result: { pick, result: flip.result, won: flip.won } };
    }
    case 'slots': {
      const r = spinSlots(seedStr);
      return {
        multiplier: r.multiplier,
        result: { reels: r.reels, indices: r.indices, nearMiss: r.nearMiss },
      };
    }
    case 'wheel': {
      const r = spinWheel(seedStr);
      return {
        multiplier: r.multiplier,
        result: { segmentIndex: r.segmentIndex, rotation: r.rotation },
      };
    }
    case 'scratch': {
      const r = scratchCard(seedStr);
      return { multiplier: r.multiplier, result: { cells: r.cells } };
    }
    case 'crash': {
      // The player's chosen cashout target drives the win check.
      const raw = Number(params.cashoutMultiplier);
      const cashoutMult = Number.isFinite(raw) && raw > 1 ? raw : 1.01;
      const r = resolveCrash(seedStr, cashoutMult);
      return {
        multiplier: r.multiplier,
        result: { crashAt: r.crashAt, cashoutMultiplier: cashoutMult, won: r.won },
      };
    }
  }
}

export const playGame = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = PlayGamePayloadSchema.parse(req.data);
    assertChips(payload.stake, 'stake');

    const game = payload.game as Game;
    const params = (payload.params ?? {}) as Record<string, unknown>;

    if (payload.stake < STAKE.MIN) {
      throw new HttpsError('invalid-argument', `Minimum stake is ${STAKE.MIN} Chips.`);
    }
    if (payload.stake > GAME_MAX_STAKE) {
      throw new HttpsError('invalid-argument', `Maximum game stake is ${GAME_MAX_STAKE} Chips.`);
    }

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const ts = now();
      const balance = (user.chipsBalance as number) ?? 0;
      if (payload.stake > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips for this stake.');
      }

      // Responsible-gaming: a wager counts toward the daily/weekly stake limits.
      const { state, limits } = readRg(user);
      const rolled = rolledRgState(state, ts);
      assertWithinRgLimits(rolled, limits, payload.stake);

      // ── Provably-fair commit + outcome ──
      const nonce = (user.gameNonce as number) ?? 0;
      const { serverSeed, serverSeedHash } = newCommitment();
      const seedStr = seedString(serverSeed, payload.clientSeed, nonce);
      const outcome = computeOutcome(game, seedStr, params);
      const payout = gamePayout(payload.stake, outcome.multiplier);
      const net = payout - payload.stake;

      // ── Money: stake → house (GAME_WAGER), then house → player on a win. ──
      const idem = `play:${uid}:${payload.idempotencyKey}`;
      const legs: LedgerLeg[] = [
        {
          uid,
          direction: LEDGER_DIRECTION.DEBIT,
          amount: payload.stake,
          reason: LEDGER_REASON.GAME_WAGER,
          bucket: 'balance' as const,
          memo: `${game} wager`,
        },
        {
          uid: HOUSE_UID,
          direction: LEDGER_DIRECTION.CREDIT,
          amount: payload.stake,
          reason: LEDGER_REASON.GAME_WAGER,
          bucket: 'balance' as const,
          memo: `${game} wager from ${uid}`,
        },
      ];
      if (payout > 0) {
        legs.push(
          {
            uid: HOUSE_UID,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: payout,
            reason: LEDGER_REASON.GAME_PAYOUT,
            bucket: 'balance' as const,
            memo: `${game} payout to ${uid}`,
          },
          {
            uid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: payout,
            reason: LEDGER_REASON.GAME_PAYOUT,
            bucket: 'balance' as const,
            memo: `${game} win`,
          },
        );
      }

      const ledgerRes = await postLedgerTxn(tx, {
        idempotencyKey: idem,
        txnGroupId: `play:${uid}:${game}`,
        legs,
      });

      // A replayed call must not double-spend or re-roll: return the recorded
      // round as-is (the round doc id is derived from the idempotency key).
      const roundId = `gr_${payload.idempotencyKey}`;
      const roundRef = db.doc(gameRoundDoc(uid, roundId));

      if (ledgerRes.replayed) {
        const existing = await tx.get(roundRef);
        const d = existing.data();
        return {
          ok: true,
          roundId,
          game,
          stake: payload.stake,
          multiplier: (d?.multiplier as number) ?? outcome.multiplier,
          payout: (d?.payout as number) ?? payout,
          net: (d?.net as number) ?? net,
          serverSeed: (d?.serverSeed as string) ?? serverSeed,
          serverSeedHash: (d?.serverSeedHash as string) ?? serverSeedHash,
          clientSeed: payload.clientSeed,
          nonce: (d?.nonce as number) ?? nonce,
          result: (d?.result as Record<string, unknown>) ?? outcome.result,
          newBalance: (user.chipsBalance as number) ?? balance,
          replayed: true,
        };
      }

      // Find the player's post-payout balance from the posted legs.
      const playerLegs = ledgerRes.posted.filter((l) => l.uid === uid);
      const newBalance =
        playerLegs.length > 0 ? playerLegs[playerLegs.length - 1].balanceAfter : balance - payload.stake;

      // ── Persist the round (provably-fair commit + reveal). ──
      tx.set(roundRef, {
        roundId,
        uid,
        game,
        stake: payload.stake,
        multiplier: outcome.multiplier,
        payout,
        net,
        serverSeedHash,
        serverSeed, // revealed (round already resolved)
        clientSeed: payload.clientSeed,
        nonce,
        result: outcome.result,
        createdAt: ts,
      });

      // Bump the per-user nonce + RG counters + lifetime wagered.
      tx.set(
        userRef,
        {
          gameNonce: FieldValue.increment(1),
          rgState: {
            todayStaked: rolled.todayStaked + payload.stake,
            weekStaked: rolled.weekStaked + payload.stake,
            todayBetCount: rolled.todayBetCount,
            lastResetAt: rolled.lastResetAt,
          },
          lifetimeWagered: FieldValue.increment(payload.stake),
        },
        { merge: true },
      );

      // Big-win discovery surfacing: a chunky multiplier becomes a feed item.
      if (outcome.multiplier >= 10 && payout > 0) {
        const itemId = `gw_${roundId}`;
        tx.set(db.doc(discoveryItemDoc(itemId)), {
          itemId,
          kind: 'game_win',
          refId: roundId,
          title: `${(user.displayName as string) ?? 'A player'} hit ${outcome.multiplier}×`,
          subtitle: `${game} · won ${payout} Chips`,
          heat: outcome.multiplier,
          actorName: (user.displayName as string) ?? 'Player',
          actorPhotoURL: (user.photoURL as string | null) ?? null,
          amount: payout,
          createdAt: ts,
        });
      }

      return {
        ok: true,
        roundId,
        game,
        stake: payload.stake,
        multiplier: outcome.multiplier,
        payout,
        net,
        serverSeed,
        serverSeedHash,
        clientSeed: payload.clientSeed,
        nonce,
        result: outcome.result,
        newBalance,
      };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to play game.');
  }
});
