/**
 * Bracket callables — a visual single-elimination tournament.
 *
 *   createBracket  — seed the first-round matches via the pure seedBracket()
 *                    helper, escrow the creator's entryFee as the prize pool,
 *                    write brackets/{bracketId} as 'open' → 'live'.
 *   advanceBracket — the creator (or an admin) sets a match winner. The winner
 *                    is propagated into the correct slot of the next round; when
 *                    the FINAL match resolves the bracket settles: the prize pool
 *                    (the creator's escrow) is released back to the champion's
 *                    backer — for the pilot that is the creator — keeping Chips
 *                    conserved. The champion competitor name is recorded.
 *
 * Money only ever moves through the ledger (escrow on create, release on
 * settle). All settlement is idempotent on the ledger key.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { formatPaths } from '../lib/formatPaths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { seedBracket, bracketRounds, type BracketMatch } from '../shared/formats';
import { makeId } from '../shared/ids';
import { LEDGER_DIRECTION, LEDGER_REASON, STAKE } from '../shared/constants';

const CreateBracketSchema = z.object({
  title: z.string().min(3).max(80),
  competitors: z.array(z.string().min(1).max(40)).min(2).max(32),
  entryFee: z.number().int().nonnegative(),
  groupId: z.string().nullable().optional(),
});

const AdvanceBracketSchema = z.object({
  bracketId: z.string(),
  matchId: z.string(),
  winnerName: z.string().min(1),
});

/** A persisted match (the schema's flat shape: aName/bName/winnerName). */
interface StoredMatch {
  matchId: string;
  round: number;
  aName: string | null;
  bName: string | null;
  winnerName?: string | null;
}

/** Convert the pure BracketMatch (slot-shaped) into the stored flat shape. */
function toStored(m: BracketMatch): StoredMatch {
  const winnerName =
    m.winnerSlotId == null
      ? null
      : m.winnerSlotId === m.a.slotId
        ? m.a.name
        : m.winnerSlotId === m.b.slotId
          ? m.b.name
          : null;
  return { matchId: m.matchId, round: m.round, aName: m.a.name, bName: m.b.name, winnerName };
}

/**
 * Given the full match list and a freshly-decided match, place that winner into
 * the next round's match slot, creating the next-round match if needed. Returns
 * the new full list and whether the FINAL is now decided + the champion name.
 */
function propagateWinner(
  matches: StoredMatch[],
  decided: StoredMatch,
  totalRounds: number,
): { matches: StoredMatch[]; champion: string | null } {
  const next = matches.map((m) => ({ ...m }));
  const nextRound = decided.round + 1;
  if (nextRound >= totalRounds) {
    // That was the final. Champion is the decided winner.
    return { matches: next, champion: decided.winnerName ?? null };
  }

  // First-round matches are ordered; index within round determines the parent.
  const roundMatches = next.filter((m) => m.round === decided.round).sort(byMatchId);
  const myIndex = roundMatches.findIndex((m) => m.matchId === decided.matchId);
  const parentIndex = Math.floor(myIndex / 2);
  const slot: 'a' | 'b' = myIndex % 2 === 0 ? 'a' : 'b';

  const parentId = `r${nextRound}m${parentIndex}`;
  let parent = next.find((m) => m.matchId === parentId);
  if (!parent) {
    parent = { matchId: parentId, round: nextRound, aName: null, bName: null, winnerName: null };
    next.push(parent);
  }
  if (slot === 'a') parent.aName = decided.winnerName ?? null;
  else parent.bName = decided.winnerName ?? null;

  return { matches: next, champion: null };
}

function byMatchId(a: StoredMatch, b: StoredMatch): number {
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export const createBracket = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateBracketSchema.parse(req.data);

    if (payload.entryFee > STAKE.DEFAULT_MAX) {
      throw new HttpsError('invalid-argument', `Entry fee cannot exceed ${STAKE.DEFAULT_MAX} Chips.`);
    }

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      if (payload.entryFee > 0) {
        const balance = (user.chipsBalance as number) ?? 0;
        if (payload.entryFee > balance) {
          throw new HttpsError('failed-precondition', 'Insufficient Chips for the entry fee.');
        }
      }

      const bracketId = makeId('brk');
      const ts = now();
      const matches = seedBracket(payload.competitors).map(toStored);

      if (payload.entryFee > 0) {
        await postLedgerTxn(tx, {
          idempotencyKey: `bracket:${bracketId}:${uid}`,
          txnGroupId: `bracket:${bracketId}:${uid}`,
          legs: [
            {
              uid,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: payload.entryFee,
              reason: LEDGER_REASON.STAKE_ESCROW,
              bucket: 'escrow',
              memo: `Bracket prize pool ${bracketId}`,
            },
          ],
        });
      }

      tx.set(db.doc(formatPaths.bracket(bracketId)), {
        bracketId,
        title: payload.title,
        groupId: payload.groupId ?? null,
        competitors: payload.competitors,
        matches,
        rounds: bracketRounds(payload.competitors.length),
        entryFee: payload.entryFee,
        poolTotal: payload.entryFee,
        status: 'live',
        creatorUid: uid,
        champion: null,
        createdAt: ts,
      });

      return { ok: true, bracketId };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create bracket.');
  }
});

export const advanceBracket = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = AdvanceBracketSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const bracketRef = db.doc(formatPaths.bracket(payload.bracketId));
      const bracketSnap = await tx.get(bracketRef);
      if (!bracketSnap.exists) throw new HttpsError('not-found', 'Bracket not found.');

      const bracket = bracketSnap.data()!;
      const isAdmin = req.auth?.token?.admin === true;
      if (bracket.creatorUid !== uid && !isAdmin) {
        throw new HttpsError('permission-denied', 'Only the bracket owner can advance matches.');
      }
      if ((bracket.status as string) === 'settled') {
        throw new HttpsError('failed-precondition', 'This bracket is already settled.');
      }

      const matches = (bracket.matches as StoredMatch[]) ?? [];
      const target = matches.find((m) => m.matchId === payload.matchId);
      if (!target) throw new HttpsError('not-found', 'Match not found in this bracket.');
      if (target.winnerName) {
        throw new HttpsError('failed-precondition', 'That match already has a winner.');
      }
      if (payload.winnerName !== target.aName && payload.winnerName !== target.bName) {
        throw new HttpsError('invalid-argument', 'The winner must be one of the two competitors.');
      }

      const decided: StoredMatch = { ...target, winnerName: payload.winnerName };
      const totalRounds = (bracket.rounds as number) ?? bracketRounds((bracket.competitors as string[]).length);

      // Apply the decided result, then propagate into the next round.
      const applied = matches.map((m) => (m.matchId === decided.matchId ? decided : m));
      const { matches: nextMatches, champion } = propagateWinner(applied, decided, totalRounds);

      const ts = now();
      if (champion != null) {
        // FINAL decided → settle: release the prize pool back to the creator
        // (the pilot's single backer), keeping Chips conserved.
        const pool = (bracket.poolTotal as number) ?? 0;
        const creatorUid = bracket.creatorUid as string;
        if (pool > 0) {
          await postLedgerTxn(tx, {
            idempotencyKey: `settleBracket:${payload.bracketId}`,
            txnGroupId: `settleBracket:${payload.bracketId}`,
            legs: [
              {
                uid: creatorUid,
                direction: LEDGER_DIRECTION.CREDIT,
                amount: pool,
                reason: LEDGER_REASON.PAYOUT,
                bucket: 'release',
                memo: `Bracket prize released ${payload.bracketId}`,
              },
            ],
          });
        }
        tx.set(
          bracketRef,
          { matches: nextMatches, champion, status: 'settled', settledAt: ts },
          { merge: true },
        );
        return { ok: true, bracketId: payload.bracketId, champion, settled: true };
      }

      tx.set(bracketRef, { matches: nextMatches, status: 'live' }, { merge: true });
      return { ok: true, bracketId: payload.bracketId, settled: false };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to advance bracket.');
  }
});
