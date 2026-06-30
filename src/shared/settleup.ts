/**
 * Card-game / home-game settle-up math. Pure, no Firebase/React. Shared by the
 * client (live preview) and Cloud Functions (authoritative settle).
 *
 * A SESSION tracks players' buy-ins (money in) and cash-outs (money out). Each
 * player's NET = cashOut - buyIn. For a fair cash game the nets sum to zero (it's
 * zero-sum among players); we surface any imbalance so the host can fix a typo
 * before settling.
 *
 * SETTLE-UP turns the per-player nets into a MINIMAL set of transfers (who pays
 * whom) so debts are cleared in as few payments as possible — the classic
 * "greedy creditor/debtor" reduction.
 */

import { assertChips } from './money';

export interface PlayerLedger {
  uid: string;
  /** Total bought in (chips put on the table over the session). */
  buyIn: number;
  /** Final cash-out / stack taken off the table. */
  cashOut: number;
}

export interface PlayerNet {
  uid: string;
  net: number; // cashOut - buyIn (positive = up, negative = down)
}

/** Net per player. Net = cashOut - buyIn. */
export function computeNets(players: PlayerLedger[]): PlayerNet[] {
  return players.map((p) => {
    assertChips(p.buyIn, 'buyIn');
    assertChips(p.cashOut, 'cashOut');
    return { uid: p.uid, net: p.cashOut - p.buyIn };
  });
}

/** Sum of all nets. For a balanced cash game this is 0. Nonzero = data error. */
export function netImbalance(players: PlayerLedger[]): number {
  return computeNets(players).reduce((s, n) => s + n.net, 0);
}

/** Total chips bought in across all players (the pot that should be cashed out). */
export function totalBuyIn(players: PlayerLedger[]): number {
  return players.reduce((s, p) => s + p.buyIn, 0);
}

export interface Transfer {
  from: string; // debtor (down money) pays…
  to: string; // creditor (up money)
  amount: number;
}

/**
 * Minimal-transaction settle-up. Given per-player nets (which must sum to ~0),
 * returns the fewest transfers that zero everyone out. Deterministic: ties broken
 * by uid so client preview and server agree byte-for-byte.
 *
 * Algorithm: repeatedly match the largest creditor with the largest debtor,
 * transferring the smaller magnitude, until all settled.
 */
export function settleUp(nets: PlayerNet[]): Transfer[] {
  // Work on a copy with integer amounts; drop already-settled (net 0) players.
  const debtors: { uid: string; amt: number }[] = [];
  const creditors: { uid: string; amt: number }[] = [];
  for (const n of nets) {
    if (n.net < 0) debtors.push({ uid: n.uid, amt: -n.net });
    else if (n.net > 0) creditors.push({ uid: n.uid, amt: n.net });
  }
  // Deterministic order: largest first, uid tiebreak.
  const byAmtThenUid = (a: { uid: string; amt: number }, b: { uid: string; amt: number }) =>
    b.amt - a.amt || a.uid.localeCompare(b.uid);
  debtors.sort(byAmtThenUid);
  creditors.sort(byAmtThenUid);

  const transfers: Transfer[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const amount = Math.min(d.amt, c.amt);
    if (amount > 0) {
      transfers.push({ from: d.uid, to: c.uid, amount });
      d.amt -= amount;
      c.amt -= amount;
    }
    if (d.amt === 0) di++;
    if (c.amt === 0) ci++;
  }
  return transfers;
}

/** Convenience: nets + settle-up + imbalance from raw player ledgers. */
export function computeSettlement(players: PlayerLedger[]): {
  nets: PlayerNet[];
  transfers: Transfer[];
  imbalance: number;
  balanced: boolean;
} {
  const nets = computeNets(players);
  const imbalance = nets.reduce((s, n) => s + n.net, 0);
  // Only produce transfers when balanced (otherwise the host has a typo to fix).
  const transfers = imbalance === 0 ? settleUp(nets) : [];
  return { nets, transfers, imbalance, balanced: imbalance === 0 };
}

// ─── Tournament placement payouts ──────────────────────────────────────────────

/** Standard payout percentages by field size (fraction of prize pool). */
function payoutStructure(numPlayers: number): number[] {
  if (numPlayers <= 2) return [1];
  if (numPlayers <= 5) return [0.65, 0.35];
  if (numPlayers <= 8) return [0.5, 0.3, 0.2];
  if (numPlayers <= 15) return [0.45, 0.27, 0.18, 0.1];
  return [0.4, 0.25, 0.16, 0.11, 0.08];
}

export interface TournamentResult {
  uid: string;
  place: number; // 1 = winner
}

export interface TournamentPayout {
  uid: string;
  place: number;
  amount: number;
}

/**
 * Split a prize pool (sum of all buy-ins) among finishers by placement, using a
 * standard structure for the field size. Largest-remainder so the whole pool is
 * paid out with no chip lost.
 */
export function tournamentPayouts(
  results: TournamentResult[],
  prizePool: number,
): TournamentPayout[] {
  assertChips(prizePool, 'prizePool');
  const sorted = [...results].sort((a, b) => a.place - b.place || a.uid.localeCompare(b.uid));
  const structure = payoutStructure(sorted.length);
  const paid = sorted.slice(0, structure.length);

  // Apportion the pool by the structure with largest-remainder (no chip lost).
  const exacts = paid.map((_p, i) => prizePool * structure[i]);
  const floors = exacts.map((e) => Math.floor(e));
  const distributed = floors.reduce((s, f) => s + f, 0);
  const leftover = prizePool - distributed;
  const order = exacts
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || paid[a.i].uid.localeCompare(paid[b.i].uid));
  const amounts = [...floors];
  for (let k = 0; k < leftover; k++) amounts[order[k % order.length].i]++;

  return paid.map((p, i) => ({ uid: p.uid, place: p.place, amount: amounts[i] }));
}
