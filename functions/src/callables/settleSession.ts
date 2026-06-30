/**
 * settleSession — the HOST closes the books on a session.
 *
 * Reads every player, computes the settlement with the shared pure math, then:
 *
 *  CASH GAMES (poker_cash / blackjack / generic):
 *    nets[p] = cashOut - buyIn. For a fair table the nets sum to ZERO (it's
 *    zero-sum among players; the pot dealt out == the pot bought in). We REJECT
 *    with a clear error if imbalance !== 0 — that means the host mis-typed a
 *    stack and must fix it before settling. The minimal who-pays-whom transfers
 *    (settleUp) are stored for display.
 *
 *  TOURNAMENTS (poker_tournament):
 *    The whole pot (sum of buy-ins) is split by finishing PLACE using the
 *    standard structure (tournamentPayouts). No imbalance check — payouts are
 *    derived from the pot directly and always sum to the pot.
 *
 *  MONEY MOVEMENT:
 *   - mode='chips':   the session pot account (which received every buy-in)
 *     pays out: pot DEBIT → each receiving player CREDIT. Conserved by
 *     construction (Σ payouts == pot). Cash games pay each player their cashOut;
 *     tournaments pay finishers their placement amount. Idempotent via the
 *     ledger key (a retry is a no-op).
 *   - mode='tracking': NO ledger movement — we only record the computed nets +
 *     transfers on the docs so players can settle up in person.
 *
 * Idempotent: re-running on an already-settled session returns the stored result.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { now } from '../lib/time';
import { callableOpts, requireAuth, toHttpsError } from '../lib/guards';
import { postLedgerTxn, type LedgerLeg } from '../lib/ledger';
import { SettleSessionPayloadSchema } from '../shared/schemas-cards';
import {
  computeSettlement,
  tournamentPayouts,
  type PlayerLedger,
  type Transfer,
  type TournamentResult,
} from '../shared/settleup';
import { LEDGER_DIRECTION, LEDGER_REASON } from '../shared/constants';
import { sessionPotAccount } from './cardPaths';

interface PlayerRow extends PlayerLedger {
  cashOutRecorded: boolean;
  place: number | null;
}

export const settleSession = onCall(callableOpts, async (req) => {
  try {
    const callerUid = requireAuth(req);
    const payload = SettleSessionPayloadSchema.parse(req.data);
    const ts = now();

    return await db.runTransaction(async (tx) => {
      const sessionRef = db.doc(paths.cardSession(payload.sessionId));
      const playersCol = db.collection(paths.sessionPlayers(payload.sessionId));

      // ── Reads first ──
      const [sessionSnap, playersSnap] = await Promise.all([tx.get(sessionRef), tx.get(playersCol)]);
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'Session not found.');
      const session = sessionSnap.data()!;

      // Idempotent replay.
      if (session.status === 'settled') {
        return {
          ok: true,
          sessionId: payload.sessionId,
          transfers: (session.transfers as Transfer[]) ?? [],
          balanced: true,
          replayed: true,
        };
      }
      if (session.status === 'cancelled') {
        throw new HttpsError('failed-precondition', 'This session was cancelled.');
      }
      if (callerUid !== (session.hostUid as string)) {
        throw new HttpsError('permission-denied', 'Only the host can settle the session.');
      }

      const mode = (session.mode as string) === 'chips' ? 'chips' : 'tracking';
      const gameType = session.gameType as string;
      const isTournament = gameType === 'poker_tournament';
      const pot = (session.pot as number) ?? 0;

      const players: PlayerRow[] = playersSnap.docs.map((d) => {
        const p = d.data();
        const cashOut = (p.cashOut as number | null) ?? null;
        return {
          uid: (p.uid as string) ?? d.id,
          buyIn: (p.buyIn as number) ?? 0,
          cashOut: cashOut ?? 0,
          cashOutRecorded: cashOut !== null,
          place: (p.place as number | null) ?? null,
        };
      });

      if (players.length === 0) {
        throw new HttpsError('failed-precondition', 'No players to settle.');
      }

      // Compute nets + transfers and (chips mode) the per-player payout from the pot.
      let transfers: Transfer[];
      let nets: { uid: string; net: number }[];
      // payouts: who receives Chips out of the pot, and how much (chips mode only).
      const payouts: { uid: string; amount: number }[] = [];

      if (isTournament) {
        // Everyone must have a place to split the prize pool fairly.
        const missing = players.filter((p) => p.place == null);
        if (missing.length > 0) {
          throw new HttpsError(
            'failed-precondition',
            'Every player needs a finishing place before a tournament can settle.',
          );
        }
        const results: TournamentResult[] = players.map((p) => ({ uid: p.uid, place: p.place as number }));
        const tp = tournamentPayouts(results, pot);
        const payoutByUid = new Map(tp.map((t) => [t.uid, t.amount]));
        // Tournament net = placement payout - buyIn (0 payout for non-cashers).
        nets = players.map((p) => ({ uid: p.uid, net: (payoutByUid.get(p.uid) ?? 0) - p.buyIn }));
        transfers = computeSettlement(
          players.map((p) => ({ uid: p.uid, buyIn: p.buyIn, cashOut: payoutByUid.get(p.uid) ?? 0 })),
        ).transfers;
        for (const t of tp) if (t.amount > 0) payouts.push({ uid: t.uid, amount: t.amount });
      } else {
        // Cash game: require every player to have a recorded cash-out.
        const noStack = players.filter((p) => !p.cashOutRecorded);
        if (noStack.length > 0) {
          throw new HttpsError(
            'failed-precondition',
            'Every player needs a recorded cash-out before settling.',
          );
        }
        const settlement = computeSettlement(
          players.map((p) => ({ uid: p.uid, buyIn: p.buyIn, cashOut: p.cashOut })),
        );
        if (!settlement.balanced) {
          throw new HttpsError(
            'failed-precondition',
            `Stacks don't balance (off by ${settlement.imbalance} Chips). Check the cash-out amounts and try again.`,
          );
        }
        nets = settlement.nets;
        transfers = settlement.transfers;
        for (const p of players) if (p.cashOut > 0) payouts.push({ uid: p.uid, amount: p.cashOut });
      }

      // ── Money movement (chips mode only) ──
      if (mode === 'chips') {
        const potUid = sessionPotAccount(payload.sessionId);
        const totalPayout = payouts.reduce((s, p) => s + p.amount, 0);
        // Conservation guard: never pay out more than the pot holds.
        if (totalPayout > pot) {
          throw new HttpsError(
            'internal',
            'Settlement would pay out more than the pot — refusing to break conservation.',
          );
        }
        // Skip non-Chipd guests defensively (chips mode never has guests, but be safe).
        const legs: LedgerLeg[] = [];
        for (const p of payouts) {
          if (p.uid.startsWith('guest:') || p.amount <= 0) continue;
          legs.push({
            uid: potUid,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: p.amount,
            reason: LEDGER_REASON.SESSION_CASHOUT,
            bucket: 'balance' as const,
            memo: `Pot pays ${p.uid} for session ${payload.sessionId}`,
          });
          legs.push({
            uid: p.uid,
            direction: LEDGER_DIRECTION.CREDIT,
            amount: p.amount,
            reason: LEDGER_REASON.SESSION_CASHOUT,
            bucket: 'balance' as const,
            memo: `Cash-out from session ${payload.sessionId}`,
          });
        }
        if (legs.length > 0) {
          await postLedgerTxn(tx, {
            idempotencyKey: `session:settle:${payload.sessionId}`,
            txnGroupId: `session:settle:${payload.sessionId}`,
            legs,
          });
        }
      }

      // ── Write final state on each player (authoritative net). ──
      const netByUid = new Map(nets.map((n) => [n.uid, n.net]));
      for (const p of players) {
        tx.set(
          db.doc(paths.sessionPlayer(payload.sessionId, p.uid)),
          { net: netByUid.get(p.uid) ?? 0 },
          { merge: true },
        );
      }

      // ── Close the session. ──
      tx.set(
        sessionRef,
        { status: 'settled', settledAt: ts, transfers },
        { merge: true },
      );

      return { ok: true, sessionId: payload.sessionId, transfers, balanced: true, replayed: false };
    });
  } catch (e) {
    throw toHttpsError(e, 'Failed to settle session.');
  }
});
