/**
 * Squares settlement — given a FINAL score, the single winning cell
 * (squaresWinningCell, using the assigned header digits) takes the whole pool.
 *
 * ONE atomic transaction (idempotent on status + the ledger key
 * `settleSquares:{gameId}`):
 *   - The board must be 'locked' (full + digits assigned).
 *   - Compute the winning cell from (rowDigit = scoreA%10, colDigit = scoreB%10).
 *   - Winner: release their own escrowed price + credit the pool profit (every
 *     OTHER cell's forfeited escrow). Losers: forfeit their escrow. Conserved:
 *     forfeited escrow == profit paid, so no Chips are minted/destroyed.
 *   - Status 'locked' → 'settled'.
 *
 * Exposed as an admin/system callable (settleSquares). The settledBy field
 * records who entered the final score.
 */
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from '../lib/admin';
import { formatPaths } from '../lib/formatPaths';
import { now } from '../lib/time';
import { postLedgerTxn, LedgerLeg } from '../lib/ledger';
import { requireAdmin, settlementOpts, toHttpsError } from '../lib/guards';
import { squaresWinningCell, type SquaresGrid } from '../shared/formats';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

const SettleSquaresPayloadSchema = z.object({
  gameId: z.string(),
  scoreA: z.number().int().nonnegative(),
  scoreB: z.number().int().nonnegative(),
});

export interface SettleSquaresResult {
  settled: boolean;
  winningCell: number | null;
  winnerUid: string | null;
  payout: number;
}

/** The atomic settlement core. Safe for an admin callable or a fixture-final hook. */
export async function runSquaresSettlement(
  gameId: string,
  scoreA: number,
  scoreB: number,
  settledBy: string,
): Promise<SettleSquaresResult> {
  return db.runTransaction(async (tx: Transaction) => {
    const gameRef = db.doc(formatPaths.squares(gameId));
    const gameSnap = await tx.get(gameRef);
    if (!gameSnap.exists) throw new HttpsError('not-found', 'Squares game not found.');

    const game = gameSnap.data()!;
    const status = game.status as string;
    if (status === 'settled') {
      return {
        settled: false,
        winningCell: (game.winningCell as number | null) ?? null,
        winnerUid: (game.winnerUid as string | null) ?? null,
        payout: (game.payout as number) ?? 0,
      };
    }
    if (status !== 'locked') {
      throw new HttpsError('failed-precondition', 'The board must be full and locked before settling.');
    }

    const size = (game.size as number) ?? 10;
    const cells = (game.cells as (string | null)[]) ?? [];
    const rowDigits = (game.rowDigits as number[] | null) ?? null;
    const colDigits = (game.colDigits as number[] | null) ?? null;
    const price = (game.pricePerSquare as number) ?? 0;

    const grid: SquaresGrid = {
      size,
      cells,
      rowDigits: rowDigits ?? undefined,
      colDigits: colDigits ?? undefined,
      pricePerSquare: price,
    };

    const winningCell = squaresWinningCell(grid, scoreA, scoreB);
    if (winningCell == null) {
      throw new HttpsError('failed-precondition', 'Could not resolve a winning cell for that score.');
    }
    const winnerUid = cells[winningCell] ?? null;
    const ts = now();

    // Build ledger legs: every owned cell forfeits its escrowed price; the winner
    // gets their own escrow released back plus the rest of the pool as profit.
    const legs: LedgerLeg[] = [];
    let pool = 0;
    for (let i = 0; i < cells.length; i++) {
      const owner = cells[i];
      if (owner == null) continue;
      pool += price;
      if (i === winningCell) {
        // Release the winner's own escrowed price back to balance.
        legs.push({
          uid: owner,
          direction: LEDGER_DIRECTION.CREDIT,
          amount: price,
          reason: LEDGER_REASON.PAYOUT,
          bucket: 'release',
          memo: `Squares stake released ${gameId}`,
        });
      } else {
        // Losers forfeit their escrow into the pool.
        legs.push({
          uid: owner,
          direction: LEDGER_DIRECTION.DEBIT,
          amount: price,
          reason: LEDGER_REASON.PAYOUT,
          bucket: 'forfeit',
          memo: `Squares stake forfeited ${gameId}`,
        });
      }
    }
    const payout = pool;
    const profit = pool - price; // forfeited by the 99 losing cells
    if (winnerUid && profit > 0) {
      legs.push({
        uid: winnerUid,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: profit,
        reason: LEDGER_REASON.PAYOUT,
        bucket: 'balance',
        memo: `Squares winnings ${gameId}`,
      });
    }

    if (legs.length > 0) {
      await postLedgerTxn(tx, {
        idempotencyKey: `settleSquares:${gameId}`,
        txnGroupId: `settleSquares:${gameId}`,
        legs,
      });
    }

    tx.set(
      gameRef,
      {
        status: 'settled',
        winningCell,
        winnerUid,
        finalScoreA: scoreA,
        finalScoreB: scoreB,
        payout: winnerUid ? payout : 0,
        settledAt: ts,
        settledBy,
      },
      { merge: true },
    );

    return { settled: true, winningCell, winnerUid, payout: winnerUid ? payout : 0 };
  });
}

export const settleSquares = onCall(settlementOpts, async (req) => {
  try {
    const adminUid = requireAdmin(req);
    const payload = SettleSquaresPayloadSchema.parse(req.data);
    const res = await runSquaresSettlement(payload.gameId, payload.scoreA, payload.scoreB, adminUid);
    return { ok: true, ...res };
  } catch (e) {
    throw toHttpsError(e, 'Failed to settle squares game.');
  }
});
