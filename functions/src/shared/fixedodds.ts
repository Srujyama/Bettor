/**
 * Fixed-odds peer betting math — the "I'll lay you 2:1" format. Pure, integer-
 * conserving, no Firebase/React. Shared by the client (preview) and Cloud
 * Functions (authoritative escrow + settlement).
 *
 * MODEL (matched peer offers, Chips only):
 *  - A MAKER posts an OFFER on one side of a binary question at decimal odds D
 *    (e.g. 2.0 = even, 3.0 = 2:1). They put up "backer stake" S; they're risking
 *    S to win S*(D-1).
 *  - A TAKER takes the other side. To cover the maker's potential win, the taker
 *    must escrow the maker's *profit* = S*(D-1). In return the taker risks that
 *    amount to win S.
 *  - Both stakes are escrowed up front. On settlement the winner takes the whole
 *    matched pot (their own stake back + the loser's). No house, no rake.
 *
 * Equivalently: at decimal odds D, backing M chips means the layer covers
 * M*(D-1). The matched pot is M + M*(D-1) = M*D, and the winner gets M*D.
 *
 * Offers can be partially filled by multiple takers; each fill is its own matched
 * pair settled independently.
 */

import { assertChips } from './money';

/** Odds bounds. Decimal odds in [1.01, 100] keeps things sane + integer-friendly. */
export const MIN_DECIMAL_ODDS = 1.01;
export const MAX_DECIMAL_ODDS = 100;

export class OddsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OddsError';
  }
}

/** Validate decimal odds are in range. */
export function assertOdds(decimal: number): number {
  if (!Number.isFinite(decimal) || decimal < MIN_DECIMAL_ODDS || decimal > MAX_DECIMAL_ODDS) {
    throw new OddsError(`Odds must be between ${MIN_DECIMAL_ODDS} and ${MAX_DECIMAL_ODDS}, got ${decimal}`);
  }
  return decimal;
}

/** Implied probability of a decimal-odds price, in [0,1]. */
export function impliedProbability(decimal: number): number {
  assertOdds(decimal);
  return 1 / decimal;
}

/** Format decimal odds as a fractional "X:Y" string (e.g. 3.0 → "2:1", 1.5 → "1:2"). */
export function toFractional(decimal: number): string {
  assertOdds(decimal);
  const profit = decimal - 1; // win per 1 staked
  if (profit <= 0) return '0:1';
  // Reduce profit:1 to a small integer ratio.
  const denom = 1;
  // Find a clean ratio: try profit as p/q.
  const ratio = approximateRatio(profit);
  return `${ratio.num}:${ratio.den * denom}`;
}

/** Format decimal odds as American (+150, -200). */
export function toAmerican(decimal: number): string {
  assertOdds(decimal);
  if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
  return `-${Math.round(100 / (decimal - 1))}`;
}

/** Parse American odds (e.g. "+150", -200) into decimal. */
export function americanToDecimal(american: number): number {
  if (american === 0) throw new OddsError('American odds cannot be 0');
  const d = american > 0 ? american / 100 + 1 : 100 / -american + 1;
  return assertOdds(Math.round(d * 100) / 100);
}

/** Approximate a positive real as a small num/den fraction (for display only). */
function approximateRatio(x: number): { num: number; den: number } {
  // Try denominators up to 10 for a clean fraction.
  let best = { num: Math.round(x), den: 1, err: Math.abs(x - Math.round(x)) };
  for (let den = 1; den <= 10; den++) {
    const num = Math.round(x * den);
    if (num <= 0) continue;
    const err = Math.abs(x - num / den);
    if (err < best.err - 1e-9) best = { num, den, err };
  }
  // Reduce.
  const g = gcd(best.num, best.den);
  return { num: best.num / g, den: best.den / g };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

// ─── Escrow / matching ─────────────────────────────────────────────────────────

/**
 * For a maker backing `backerStake` chips at decimal odds D, the amount the
 * taker (layer) must escrow to cover the maker's potential profit.
 *   layerRisk = ceil(backerStake * (D - 1))
 * (ceil so the layer always fully covers the maker; never under-collateralized.)
 */
export function layerRiskFor(backerStake: number, decimal: number): number {
  assertChips(backerStake, 'backerStake');
  assertOdds(decimal);
  return Math.ceil(backerStake * (decimal - 1));
}

/**
 * The maker's potential profit (== layer risk, the amount the layer puts up).
 * Kept as a named alias for clarity at call sites.
 */
export const makerProfitFor = layerRiskFor;

/** Total matched pot when a maker stake is fully matched: backerStake + layerRisk. */
export function matchedPot(backerStake: number, decimal: number): number {
  return backerStake + layerRiskFor(backerStake, decimal);
}

export interface FillResult {
  /** Backer stake matched by this fill (≤ remaining maker stake). */
  backerStakeMatched: number;
  /** Chips the taker (layer) escrows for this fill. */
  layerRisk: number;
  /** The pot for this fill (winner takes it). */
  pot: number;
  /** Maker stake left unmatched after this fill. */
  remainingAfter: number;
}

/**
 * A taker wants to lay up to `takerBudget` chips against an offer with
 * `remainingBackerStake` unmatched at decimal odds D. Computes how much of the
 * maker's stake this fill covers (a partial fill if the budget can't cover it
 * all), the taker's escrow, and the pot. Returns null if no whole-chip fill is
 * possible.
 */
export function computeFill(
  remainingBackerStake: number,
  decimal: number,
  takerBudget: number,
): FillResult | null {
  assertChips(remainingBackerStake, 'remainingBackerStake');
  assertChips(takerBudget, 'takerBudget');
  assertOdds(decimal);
  if (remainingBackerStake <= 0 || takerBudget <= 0) return null;

  const fullRisk = layerRiskFor(remainingBackerStake, decimal);
  if (takerBudget >= fullRisk) {
    // Taker can cover the whole remaining offer.
    return {
      backerStakeMatched: remainingBackerStake,
      layerRisk: fullRisk,
      pot: remainingBackerStake + fullRisk,
      remainingAfter: 0,
    };
  }
  // Partial fill: the most maker stake the budget can cover = floor(budget/(D-1)).
  const backerStakeMatched = Math.floor(takerBudget / (decimal - 1));
  if (backerStakeMatched <= 0) return null;
  const layerRisk = layerRiskFor(backerStakeMatched, decimal);
  return {
    backerStakeMatched,
    layerRisk,
    pot: backerStakeMatched + layerRisk,
    remainingAfter: remainingBackerStake - backerStakeMatched,
  };
}

export interface FixedOddsSettlement {
  /** Who wins this matched pair: 'backer' (maker's side) or 'layer' (taker's side). */
  winner: 'backer' | 'layer';
  /** Chips paid to the winner (the whole pot). */
  payout: number;
  /** Conservation proof: payout === backerStake + layerRisk. */
  pot: number;
}

/**
 * Settle one matched fixed-odds pair. The winner takes the whole pot. `backerWon`
 * is true when the maker's backed side hit. Conserves chips exactly.
 */
export function settleMatch(
  backerStake: number,
  decimal: number,
  backerWon: boolean,
): FixedOddsSettlement {
  assertChips(backerStake, 'backerStake');
  const layerRisk = layerRiskFor(backerStake, decimal);
  const pot = backerStake + layerRisk;
  return { winner: backerWon ? 'backer' : 'layer', payout: pot, pot };
}

/** Refund split for a voided/cancelled match: each side gets exactly their escrow back. */
export function refundMatch(backerStake: number, decimal: number): { backerRefund: number; layerRefund: number } {
  return { backerRefund: backerStake, layerRefund: layerRiskFor(backerStake, decimal) };
}
