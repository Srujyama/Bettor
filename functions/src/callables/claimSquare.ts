/**
 * claimSquare — THE money path for squares. ONE atomic transaction:
 *   re-read the game (must be 'open') + the user → assert the target cell is
 *   free and within range → assert balance ≥ pricePerSquare → escrow the price
 *   via the ledger (STAKE_ESCROW) → write the uid into the cell + bump poolTotal.
 *   When the LAST cell fills, assign shuffled row/col header digits and lock the
 *   board. Idempotent: re-claiming a cell the caller already owns is a no-op.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { formatPaths } from '../lib/formatPaths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { postLedgerTxn } from '../lib/ledger';
import { ClaimSquarePayloadSchema } from '../shared/schemas-ext';
import { squaresIsFull, shuffledDigits, type SquaresGrid } from '../shared/formats';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';

export const claimSquare = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = ClaimSquarePayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const gameRef = db.doc(formatPaths.squares(payload.gameId));
      const userRef = db.doc(paths.user(uid));
      const [gameSnap, userSnap] = await Promise.all([tx.get(gameRef), tx.get(userRef)]);

      if (!gameSnap.exists) throw new HttpsError('not-found', 'Squares game not found.');
      const game = gameSnap.data()!;
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      if ((game.status as string) !== 'open') {
        throw new HttpsError('failed-precondition', 'This board is no longer open.');
      }

      const size = (game.size as number) ?? 10;
      const cells = [...((game.cells as (string | null)[]) ?? [])];
      const idx = payload.cellIndex;
      if (idx < 0 || idx >= size * size) {
        throw new HttpsError('invalid-argument', 'That square is out of range.');
      }
      if (cells[idx] === uid) {
        // Idempotent: caller already owns this cell.
        return { ok: true, gameId: payload.gameId, cellIndex: idx, alreadyClaimed: true };
      }
      if (cells[idx] != null) {
        throw new HttpsError('failed-precondition', 'That square is already taken.');
      }

      const price = (game.pricePerSquare as number) ?? 0;
      const balance = (user.chipsBalance as number) ?? 0;
      if (price > balance) {
        throw new HttpsError('failed-precondition', 'Insufficient Chips to claim this square.');
      }

      // Escrow the price (balance → held). Key by game + uid + cell so each cell
      // claim is its own idempotent escrow.
      await postLedgerTxn(tx, {
        idempotencyKey: `squares:${payload.gameId}:${uid}:${idx}`,
        txnGroupId: `squares:${payload.gameId}:${uid}`,
        legs: [
          {
            uid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: price,
            reason: LEDGER_REASON.STAKE_ESCROW,
            bucket: 'escrow',
            memo: `Squares cell ${idx} on ${payload.gameId}`,
          },
        ],
      });

      cells[idx] = uid;

      // When the board fills, assign header digits and lock it.
      const filledGrid: SquaresGrid = {
        size,
        cells,
        pricePerSquare: price,
      };
      const nowFull = squaresIsFull(filledGrid);
      const update: Record<string, unknown> = {
        cells,
        poolTotal: FieldValue.increment(price),
      };
      if (nowFull) {
        // Deterministic seed from the game id + time so the assignment is auditable.
        const seed = hashSeed(`${payload.gameId}:${now()}`);
        update.rowDigits = shuffledDigits(seed);
        update.colDigits = shuffledDigits(seed ^ 0x9e3779b9);
        update.status = 'locked';
        update.lockedAt = now();
      }

      tx.set(gameRef, update, { merge: true });

      return { ok: true, gameId: payload.gameId, cellIndex: idx, locked: nowFull };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to claim square.');
  }
});

/** Cheap 32-bit string hash → unsigned int seed for shuffledDigits. */
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
