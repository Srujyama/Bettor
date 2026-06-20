/**
 * Prediction-market math — Kalshi/Polymarket-style YES/NO markets, settled in
 * Chips. Pure, deterministic, no Firebase/React. Runs on the client for live
 * price preview and on Cloud Functions for the authoritative trade.
 *
 * Pricing uses the LMSR (Logarithmic Market Scoring Rule) automated market
 * maker. A market holds quantities of YES and NO shares (q.yes, q.no). The cost
 * function C(q) = b * ln(e^(q.yes/b) + e^(q.no/b)) defines the cost of any state;
 * the cost to move from one share-state to another is C(after) - C(before). The
 * instantaneous price of YES is the logistic of the share imbalance and always
 * lives in (0, 1) — read as a probability / cents-on-the-dollar.
 *
 * A winning share pays out SHARE_PAYOUT (100 Chips = "a dollar") at resolution.
 * The AMM's liquidity parameter `b` controls depth: bigger b = less price impact
 * per Chip. The maximum the house can lose is b * ln(2) (bounded), funded by the
 * initial liquidity seed — so the economy stays conservable.
 */

import { assertChips } from './money';

/** A resolved winning share is worth this many Chips ("$1.00" in cents-as-Chips). */
export const SHARE_PAYOUT = 100;

export type MarketSide = 'yes' | 'no';

export interface MarketState {
  /** Outstanding YES shares held by traders (AMM short). */
  qYes: number;
  /** Outstanding NO shares. */
  qNo: number;
  /** Liquidity parameter (depth). Higher = flatter price. */
  b: number;
}

/** LMSR cost function C(q). Numerically stable via the log-sum-exp trick. */
export function cost(state: MarketState): number {
  const { qYes, qNo, b } = state;
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  return b * (m + Math.log(Math.exp(a - m) + Math.exp(c - m)));
}

/** Instantaneous price of YES in [0,1] (probability / dollars). NO price = 1 - this. */
export function priceYes(state: MarketState): number {
  const { qYes, qNo, b } = state;
  const a = qYes / b;
  const c = qNo / b;
  const m = Math.max(a, c);
  const ea = Math.exp(a - m);
  const ec = Math.exp(c - m);
  return ea / (ea + ec);
}

export function price(state: MarketState, side: MarketSide): number {
  const py = priceYes(state);
  return side === 'yes' ? py : 1 - py;
}

/** Price in integer cents (1–99), which is how the UI shows market odds. */
export function priceCents(state: MarketState, side: MarketSide): number {
  return Math.max(1, Math.min(99, Math.round(price(state, side) * 100)));
}

export interface TradeQuote {
  /** Shares received for the given Chip budget. */
  shares: number;
  /** Chips actually spent (== budget, minus any rounding). */
  cost: number;
  /** Average price paid per share, in cents. */
  avgPriceCents: number;
  /** The market state AFTER the trade. */
  after: MarketState;
  /** If this side resolves YES/winning, total payout for the shares bought. */
  potentialPayout: number;
}

/**
 * Buy `side` shares with a Chip `budget`. We solve for the share quantity whose
 * marginal LMSR cost equals the budget (binary search — exact enough for integer
 * Chips and far simpler than the closed form, which is fine off the hot path and
 * deterministic). Returns whole shares (floor) and the precise Chip cost.
 */
export function quoteBuy(state: MarketState, side: MarketSide, budget: number): TradeQuote {
  assertChips(budget, 'budget');
  const c0 = cost(state);
  // Find max shares s.t. cost(after) - c0 <= budget, via binary search on shares.
  let lo = 0;
  let hi = 1;
  const afterFor = (shares: number): MarketState =>
    side === 'yes'
      ? { ...state, qYes: state.qYes + shares }
      : { ...state, qNo: state.qNo + shares };
  // Expand hi until it overshoots the budget.
  while (cost(afterFor(hi)) - c0 <= budget && hi < 1e9) hi *= 2;
  // Binary search for the boundary.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cost(afterFor(mid)) - c0 <= budget) lo = mid;
    else hi = mid;
  }
  const shares = Math.floor(lo);
  if (shares <= 0) {
    return {
      shares: 0,
      cost: 0,
      avgPriceCents: priceCents(state, side),
      after: state,
      potentialPayout: 0,
    };
  }
  const after = afterFor(shares);
  const spent = Math.ceil(cost(after) - c0);
  // Average price paid per share, expressed in cents (a share pays SHARE_PAYOUT).
  const avgPriceCents = Math.max(1, Math.min(99, Math.round((spent / (shares * SHARE_PAYOUT)) * 100)));
  return { shares, cost: spent, avgPriceCents, after, potentialPayout: shares * SHARE_PAYOUT };
}

/** Sell `shares` of `side` back to the AMM; returns Chips credited and the new state. */
export function quoteSell(state: MarketState, side: MarketSide, shares: number): { proceeds: number; after: MarketState } {
  if (shares <= 0) return { proceeds: 0, after: state };
  const c0 = cost(state);
  const after: MarketState =
    side === 'yes'
      ? { ...state, qYes: Math.max(0, state.qYes - shares) }
      : { ...state, qNo: Math.max(0, state.qNo - shares) };
  const proceeds = Math.max(0, Math.floor(c0 - cost(after)));
  return { proceeds, after };
}

/**
 * The AMM's maximum possible loss (its required liquidity reserve), b*ln(2).
 * The house seeds this so payouts are always funded — keeps Chips conservable.
 */
export function maxSubsidy(b: number): number {
  return Math.ceil(b * Math.LN2);
}

/** A friendly default depth for a pilot market given an intended seed budget. */
export function liquidityForSeed(seedChips: number): number {
  // Invert maxSubsidy: b = seed / ln(2).
  return Math.max(1, Math.floor(seedChips / Math.LN2));
}
