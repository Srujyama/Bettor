/**
 * createSession — a host opens a card-game home session (poker cash, poker
 * tournament, blackjack, or a generic banker game). No money moves here: we just
 * write the session doc at status=open and add the host as the first player.
 *
 * Two modes:
 *  - 'chips':    buy-ins/payouts move real Chips via the ledger (a session pot
 *                account holds the table; settle pays it back out — conserved).
 *  - 'tracking': nothing touches the ledger; the session is a shared scoreboard
 *                of who's up/down for an in-person home game (no Chips at stake).
 *
 * Idempotent on the client-supplied idempotencyKey (namespaced by uid) so a retry
 * never creates two sessions.
 */
import { onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { newUlid } from '../shared/ids';
import { callableOpts, requireAuth, assertUserAllowed, toHttpsError } from '../lib/guards';
import { CreateSessionPayloadSchema } from '../shared/schemas-cards';

export const createSession = onCall(callableOpts, async (req) => {
  try {
    const uid = requireAuth(req);
    const payload = CreateSessionPayloadSchema.parse(req.data);
    const ts = now();

    const markerKey = `session:create:${uid}:${payload.idempotencyKey}`;

    return await db.runTransaction(async (tx) => {
      const userRef = db.doc(paths.user(uid));
      const markerRef = db.doc(paths.idempotency(markerKey));

      // ── Reads first ──
      const [userSnap, markerSnap] = await Promise.all([tx.get(userRef), tx.get(markerRef)]);

      // Idempotent replay: return the session id we recorded last time.
      if (markerSnap.exists) {
        const data = markerSnap.data() ?? {};
        return { ok: true, sessionId: (data.sessionId as string) ?? '', replayed: true };
      }

      const user = userSnap.data();
      // Hosting a session never moves the host's own money in tracking mode, but
      // it does in chips mode (later, at buy-in); gate consistently on age either
      // way so the same trust bar applies.
      assertUserAllowed(user, { requireAge: true });

      const sessionId = newUlid();
      const sessionRef = db.doc(paths.cardSession(sessionId));
      const hostPlayerRef = db.doc(paths.sessionPlayer(sessionId, uid));

      const hostName = (user.displayName as string) ?? 'Host';
      const hostPhoto = (user.photoURL as string | null) ?? null;
      const defaultBuyIn = payload.defaultBuyIn ?? 0;

      // Session doc (CardSession). All money fields start at 0; CF-maintained.
      tx.set(sessionRef, {
        sessionId,
        hostUid: uid,
        hostName,
        title: payload.title,
        gameType: payload.gameType,
        mode: payload.mode,
        defaultBuyIn,
        status: 'open',
        playerCount: 1,
        pot: 0,
        // Denormalized membership for "host or member" reads (array-contains).
        // Guests have no uid here (they can't read the app), so only real users.
        memberUids: [uid],
        createdAt: ts,
        settledAt: null,
        transfers: [],
      });

      // Host joins as the first player (SessionPlayer).
      tx.set(hostPlayerRef, {
        uid,
        displayName: hostName,
        photoURL: hostPhoto,
        isGuest: false,
        buyIn: 0,
        cashOut: null,
        place: null,
        net: null,
        joinedAt: ts,
      });

      // Idempotency marker (inside the txn → exactly-once).
      tx.set(markerRef, {
        key: markerKey,
        sessionId,
        createdAt: ts,
        expireAt: ts + 30 * 24 * 60 * 60 * 1000,
      });

      return { ok: true, sessionId, replayed: false };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to create session.');
  }
});
