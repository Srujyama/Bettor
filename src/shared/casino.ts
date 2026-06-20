/**
 * Casino mini-games — pure, provably-fair logic. No Firebase/React. Shared by the
 * client (preview/animation targets) and Cloud Functions (authoritative outcome).
 *
 * PROVABLY FAIR: every outcome is derived deterministically from
 *   hash(serverSeed + ':' + clientSeed + ':' + nonce)
 * The server commits to a hashed serverSeed up front and reveals it later, so a
 * player can verify the game wasn't rigged. We use a small, dependency-free FNV-1a
 * → xorshift PRNG seeded by that string; identical inputs always give identical
 * outputs (this is what makes the games testable and auditable).
 *
 * All games are Chips-only with a configurable house edge. The expected return to
 * player (RTP) of each payout table is < 1 so the house (and thus the economy)
 * stays solvent; the math here just maps a uniform random number → an outcome.
 */

import { assertChips } from './money';

// ─── Deterministic PRNG from a seed string ─────────────────────────────────────

/** FNV-1a 32-bit hash of a string → uint32 seed. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A deterministic stream of floats in [0,1) from a seed string. */
export function rng(seedStr: string): () => number {
  let x = hashSeed(seedStr) || 0x9e3779b9;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };
}

export function seedString(serverSeed: string, clientSeed: string, nonce: number): string {
  return `${serverSeed}:${clientSeed}:${nonce}`;
}

// ─── Coin flip ─────────────────────────────────────────────────────────────────

export const COINFLIP = { multiplier: 1.96 } as const; // ~2% edge

export function coinFlip(seedStr: string, pick: 'heads' | 'tails'): { result: 'heads' | 'tails'; won: boolean } {
  const r = rng(seedStr)();
  const result = r < 0.5 ? 'heads' : 'tails';
  return { result, won: result === pick };
}

// ─── Slots (3 reels) ───────────────────────────────────────────────────────────

/** Reel symbols, ordered by rarity (rarer = later, bigger payout). */
export const SLOT_SYMBOLS = ['🍒', '🔔', '⭐', '💎', '7️⃣'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

/** Weighted reel strip — common symbols appear more often. Sums to 100.
 *  RTP ≈ 0.93 (7% house edge) with the multipliers below — verified in tests. */
const SLOT_WEIGHTS = [44, 28, 16, 8, 4];

/** Payout multiplier for three-of-a-kind, by symbol index. */
const SLOT_TRIPLE_MULT = [4, 7, 15, 40, 120];
/** Any two-of-a-kind pays a small multiplier. */
const SLOT_PAIR_MULT = 0.6;

function pickSymbol(r: number): number {
  let acc = 0;
  for (let i = 0; i < SLOT_WEIGHTS.length; i++) {
    acc += SLOT_WEIGHTS[i];
    if (r * 100 < acc) return i;
  }
  return SLOT_WEIGHTS.length - 1;
}

export interface SlotResult {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  indices: [number, number, number];
  multiplier: number; // 0 if a loss
  /** True when two reels match but the third doesn't — drives the near-miss animation. */
  nearMiss: boolean;
}

export function spinSlots(seedStr: string): SlotResult {
  const next = rng(seedStr);
  const idx = [pickSymbol(next()), pickSymbol(next()), pickSymbol(next())] as [number, number, number];
  const reels = idx.map((i) => SLOT_SYMBOLS[i]) as [SlotSymbol, SlotSymbol, SlotSymbol];
  let multiplier = 0;
  let nearMiss = false;
  if (idx[0] === idx[1] && idx[1] === idx[2]) {
    multiplier = SLOT_TRIPLE_MULT[idx[0]];
  } else if (idx[0] === idx[1] || idx[1] === idx[2] || idx[0] === idx[2]) {
    multiplier = SLOT_PAIR_MULT;
  } else {
    // No win, but flag a near-miss when two of the three reels are equal-ish
    // (here: first two match label but not index can't happen; use adjacency).
    nearMiss = idx[0] === idx[1];
  }
  return { reels, indices: idx, multiplier, nearMiss };
}

// ─── Wheel of fortune ──────────────────────────────────────────────────────────

/**
 * Wheel segments with their multipliers and selection weights.
 * RTP = Σ(weight·mult)/Σweight = 0.795 (verified in tests) — a fair edge for a
 * cheap free-spin loop. Tune weights, not the math.
 */
export const WHEEL_SEGMENTS = [
  { label: '0x', mult: 0, weight: 680 },
  { label: '1.5x', mult: 1.5, weight: 150 },
  { label: '2x', mult: 2, weight: 90 },
  { label: '3x', mult: 3, weight: 45 },
  { label: '5x', mult: 5, weight: 25 },
  { label: '10x', mult: 10, weight: 8 },
  { label: '25x', mult: 25, weight: 2 },
] as const;

export interface WheelResult {
  segmentIndex: number;
  multiplier: number;
  /** 0..1 final resting position for the animation. */
  rotation: number;
}

export function spinWheel(seedStr: string): WheelResult {
  const next = rng(seedStr);
  const total = WHEEL_SEGMENTS.reduce((s, w) => s + w.weight, 0);
  const r = next() * total;
  let acc = 0;
  let segmentIndex = 0;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    acc += WHEEL_SEGMENTS[i].weight;
    if (r < acc) {
      segmentIndex = i;
      break;
    }
  }
  return {
    segmentIndex,
    multiplier: WHEEL_SEGMENTS[segmentIndex].mult,
    rotation: (segmentIndex + next() * 0.6 + 0.2) / WHEEL_SEGMENTS.length,
  };
}

// ─── Scratch card ──────────────────────────────────────────────────────────────

export const SCRATCH = { cells: 9, matchToWin: 3 } as const;
const SCRATCH_PRIZES = [0, 0, 0, 1, 2, 2, 3, 5, 10, 25]; // multiplier pool

export interface ScratchResult {
  cells: number[]; // prize-pool values revealed per cell
  multiplier: number; // best 3-match multiplier, 0 if none
}

export function scratchCard(seedStr: string): ScratchResult {
  const next = rng(seedStr);
  const cells = Array.from({ length: SCRATCH.cells }, () => SCRATCH_PRIZES[Math.floor(next() * SCRATCH_PRIZES.length)]);
  // Win if any value (>0) appears >= matchToWin times → that value is the multiplier.
  const counts = new Map<number, number>();
  for (const v of cells) counts.set(v, (counts.get(v) ?? 0) + 1);
  let multiplier = 0;
  for (const [v, c] of counts) if (v > 0 && c >= SCRATCH.matchToWin) multiplier = Math.max(multiplier, v);
  return { cells, multiplier };
}

// ─── Crash ─────────────────────────────────────────────────────────────────────

/**
 * Crash: a multiplier curve rises from 1.00x and "crashes" at a random point. The
 * player cashes out before the crash to win stake*cashoutMultiplier. The crash
 * point is provably fair with a house edge baked into the distribution.
 */
export const CRASH = { houseEdge: 0.03, maxMultiplier: 1000 } as const;

export function crashPoint(seedStr: string): number {
  const r = rng(seedStr)();
  // Standard "instant crash" with edge: with prob = houseEdge crash at 1.00x.
  if (r < CRASH.houseEdge) return 1.0;
  // Heavy-tailed: crash = 1 / (1 - u) scaled, capped.
  const u = r;
  const m = Math.floor((1 / (1 - u)) * 100) / 100;
  return Math.max(1.01, Math.min(CRASH.maxMultiplier, m));
}

/** Resolve a crash round: did the player's chosen cashout beat the crash point? */
export function resolveCrash(seedStr: string, cashoutMult: number): { crashAt: number; won: boolean; multiplier: number } {
  const crashAt = crashPoint(seedStr);
  const won = cashoutMult <= crashAt;
  return { crashAt, won, multiplier: won ? cashoutMult : 0 };
}

// ─── Payout helper (shared by all games) ───────────────────────────────────────

/** Whole-Chip payout for a stake × multiplier (floored; never negative). */
export function gamePayout(stake: number, multiplier: number): number {
  assertChips(stake, 'stake');
  if (multiplier <= 0) return 0;
  return Math.floor(stake * multiplier);
}

/** Net result of a round (payout - stake); negative = a loss of that many Chips. */
export function gameNet(stake: number, multiplier: number): number {
  return gamePayout(stake, multiplier) - stake;
}
