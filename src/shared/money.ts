/**
 * Pure Chip math. NO floating-point drift, NO Firebase, NO side effects.
 *
 * This module is the single payout truth. It runs on the client for *preview*
 * and on Cloud Functions for the *authoritative* settlement. Because both sides
 * import the exact same code, a preview can never disagree with the real result.
 *
 * Invariant we guarantee everywhere: Chips are non-negative integers, and the
 * sum of everything paid out + rake retained == the pool. No Chip is created or
 * destroyed during settlement.
 */

import { ECONOMY } from './constants';

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Assert a value is a valid Chip amount: a non-negative safe integer. */
export function assertChips(amount: number, label = 'amount'): number {
  if (!Number.isInteger(amount)) throw new MoneyError(`${label} must be an integer Chip amount, got ${amount}`);
  if (amount < 0) throw new MoneyError(`${label} must be non-negative, got ${amount}`);
  if (!Number.isSafeInteger(amount)) throw new MoneyError(`${label} exceeds safe integer range`);
  return amount;
}

/** Apply a basis-points rake to a pool, returning {rake, net}. Floors the rake (house never over-takes). */
export function applyRake(pool: number, rakeBps: number): { rake: number; net: number } {
  assertChips(pool, 'pool');
  if (!Number.isInteger(rakeBps) || rakeBps < 0 || rakeBps > 10_000) {
    throw new MoneyError(`rakeBps must be an integer in [0, 10000], got ${rakeBps}`);
  }
  const rake = Math.floor((pool * rakeBps) / 10_000);
  return { rake, net: pool - rake };
}

export interface Stakeholder {
  uid: string;
  stake: number;
}

export interface Payout {
  uid: string;
  /** Total Chips returned to this user (their share of the net pool). */
  amount: number;
  /** Of `amount`, how much is profit above their original stake (can be negative if a loser — but losers get 0). */
  profit: number;
}

export interface SettlementResult {
  payouts: Payout[];
  rake: number;
  /** The full pool that came in. */
  pool: number;
  /** Sum of all payouts. payoutTotal + rake === pool (the conservation checksum). */
  payoutTotal: number;
  model: 'PARI_MUTUEL' | 'WINNER_TAKE_ALL' | 'REFUND_ALL';
}

/**
 * Largest-remainder apportionment. Distributes `total` Chips across `weights`
 * proportionally, as integers, with NO Chip lost to rounding. The remainder
 * Chips go to the entries with the largest fractional parts (ties broken by uid
 * for determinism — server and client agree byte-for-byte).
 */
export function apportion(total: number, weights: { uid: string; weight: number }[]): Map<string, number> {
  assertChips(total, 'total');
  const result = new Map<string, number>();
  if (weights.length === 0) return result;

  const weightSum = weights.reduce((s, w) => s + w.weight, 0);
  if (weightSum <= 0) {
    // Degenerate: no positive weights. Hand the whole amount to the first entry deterministically.
    const sorted = [...weights].sort((a, b) => a.uid.localeCompare(b.uid));
    result.set(sorted[0].uid, total);
    for (let i = 1; i < sorted.length; i++) result.set(sorted[i].uid, 0);
    return result;
  }

  const floors = weights.map((w) => {
    const exact = (total * w.weight) / weightSum;
    const floor = Math.floor(exact);
    return { uid: w.uid, floor, remainder: exact - floor };
  });

  let distributed = floors.reduce((s, f) => s + f.floor, 0);
  let leftover = total - distributed;

  // Hand leftover Chips, one each, to the largest fractional remainders.
  const byRemainder = [...floors].sort(
    (a, b) => b.remainder - a.remainder || a.uid.localeCompare(b.uid),
  );
  for (const f of floors) result.set(f.uid, f.floor);
  for (let i = 0; i < leftover; i++) {
    const target = byRemainder[i % byRemainder.length];
    result.set(target.uid, (result.get(target.uid) ?? 0) + 1);
  }
  return result;
}

/**
 * PARI_MUTUEL settlement: the net pool (after rake) is split among the winners
 * pro-rata to their stake on the winning outcome. Winners always get at least
 * their stake back relative to each other; losers get nothing.
 *
 * If there are NO winners (everyone lost / the winning side had no backers),
 * we REFUND everyone their stake — Chips are never stranded.
 */
export function settlePariMutuel(
  allEntries: { uid: string; stake: number; outcomeId: string }[],
  winningOutcomeId: string,
  rakeBps: number = ECONOMY.RAKE_BPS,
): SettlementResult {
  const pool = allEntries.reduce((s, e) => s + assertChips(e.stake, 'stake'), 0);
  const winners = allEntries.filter((e) => e.outcomeId === winningOutcomeId);

  if (winners.length === 0) {
    return refundAll(allEntries, pool);
  }

  const { rake, net } = applyRake(pool, rakeBps);
  const shares = apportion(
    net,
    winners.map((w) => ({ uid: w.uid, weight: w.stake })),
  );

  const payouts: Payout[] = winners.map((w) => {
    const amount = shares.get(w.uid) ?? 0;
    return { uid: w.uid, amount, profit: amount - w.stake };
  });

  const payoutTotal = payouts.reduce((s, p) => s + p.amount, 0);
  verifyConservation(pool, payoutTotal, rake);
  return { payouts, rake, pool, payoutTotal, model: 'PARI_MUTUEL' };
}

/**
 * WINNER_TAKE_ALL: the entire net pool goes to backers of the winning outcome,
 * split pro-rata among them (so two people on the same winning side share by
 * stake). Functionally PARI_MUTUEL with the same code path — kept distinct for
 * clarity of intent and analytics.
 */
export function settleWinnerTakeAll(
  allEntries: { uid: string; stake: number; outcomeId: string }[],
  winningOutcomeId: string,
  rakeBps: number = ECONOMY.RAKE_BPS,
): SettlementResult {
  const res = settlePariMutuel(allEntries, winningOutcomeId, rakeBps);
  return { ...res, model: res.model === 'REFUND_ALL' ? 'REFUND_ALL' : 'WINNER_TAKE_ALL' };
}

/** Refund every participant their exact stake. Used for voids and no-winner cases. Rake is always 0 here. */
export function refundAll(
  allEntries: { uid: string; stake: number }[],
  poolOverride?: number,
): SettlementResult {
  const pool = poolOverride ?? allEntries.reduce((s, e) => s + assertChips(e.stake, 'stake'), 0);
  const payouts: Payout[] = allEntries.map((e) => ({ uid: e.uid, amount: e.stake, profit: 0 }));
  const payoutTotal = payouts.reduce((s, p) => s + p.amount, 0);
  verifyConservation(pool, payoutTotal, 0);
  return { payouts, rake: 0, pool, payoutTotal, model: 'REFUND_ALL' };
}

/** The conservation checksum. Throws if a single Chip would be created or lost. */
export function verifyConservation(pool: number, payoutTotal: number, rake: number): void {
  if (payoutTotal + rake !== pool) {
    throw new MoneyError(
      `Conservation violated: payouts(${payoutTotal}) + rake(${rake}) != pool(${pool})`,
    );
  }
}

/**
 * Preview helper for the staking UI: given the current pool-by-outcome and a
 * hypothetical stake on `outcomeId`, estimate the payout if that outcome wins.
 * NON-authoritative — for display only. The server recomputes at settlement.
 */
export function previewPayout(
  poolByOutcome: Record<string, number>,
  outcomeId: string,
  myStake: number,
  rakeBps: number = ECONOMY.RAKE_BPS,
): { estPayout: number; estProfit: number; impliedMultiplier: number } {
  assertChips(myStake, 'myStake');
  const totalPool = Object.values(poolByOutcome).reduce((s, v) => s + v, 0) + myStake;
  const winningSidePool = (poolByOutcome[outcomeId] ?? 0) + myStake;
  const { net } = applyRake(totalPool, rakeBps);
  if (winningSidePool <= 0) return { estPayout: myStake, estProfit: 0, impliedMultiplier: 1 };
  const estPayout = Math.floor((net * myStake) / winningSidePool);
  return {
    estPayout,
    estProfit: estPayout - myStake,
    impliedMultiplier: myStake > 0 ? estPayout / myStake : 1,
  };
}

/** Format a Chip amount for display, e.g. 1234567 -> "1,234,567". */
export function formatChips(amount: number): string {
  return Math.trunc(amount).toLocaleString('en-US');
}

/** Compact form for tight UI, e.g. 12500 -> "12.5K", 1200000 -> "1.2M". */
export function formatChipsCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs < 1_000) return String(Math.trunc(amount));
  if (abs < 1_000_000) return `${(amount / 1_000).toFixed(abs < 10_000 ? 1 : 0)}K`;
  return `${(amount / 1_000_000).toFixed(1)}M`;
}
