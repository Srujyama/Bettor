/**
 * createSquaresGame — open a 10×10 squares pool. No money moves here (claiming a
 * cell is the money path, see claimSquare). Writes squares/{gameId}
 * (SquaresGame) as 'open' with an empty grid. Validate with the zod payload.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { formatPaths } from '../lib/formatPaths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { CreateSquaresPayloadSchema } from '../shared/schemas-ext';
import { newSquaresGrid } from '../shared/formats';
import { makeId } from '../shared/ids';

/** Fixed grid size for the pilot. */
const SQUARES_SIZE = 10;

export const createSquaresGame = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateSquaresPayloadSchema.parse(req.data);

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const userSnap = await tx.get(userRef);
      const user = userSnap.data();
      assertUserAllowed(user, { requireAge: true });

      const gameId = makeId('sq');
      const ts = now();
      const grid = newSquaresGrid(SQUARES_SIZE, payload.pricePerSquare);

      tx.set(db.doc(formatPaths.squares(gameId)), {
        gameId,
        title: payload.title,
        size: grid.size,
        pricePerSquare: payload.pricePerSquare,
        cells: grid.cells,
        rowDigits: null,
        colDigits: null,
        poolTotal: 0,
        groupId: payload.groupId ?? null,
        status: 'open',
        creatorUid: uid,
        createdAt: ts,
      });

      return { ok: true, gameId };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create squares game.');
  }
});
