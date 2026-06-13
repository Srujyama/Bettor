/**
 * Pure logic for the new multi-bet FORMATS: parlays, brackets, squares.
 * No Firebase, no React. Used for client preview and authoritative server math.
 *
 * In the Chip pilot, a parlay is a peer pool too (you and friends each build a
 * slip; the pool pays the slips that hit). The pari-mutuel core in money.ts still
 * does the actual Chip apportionment — these helpers compute which slips "hit"
 * and the implied multipliers shown in the UI.
 */

import { assertChips } from './money';

// ─── Parlays ─────────────────────────────────────────────────────────────────

/**
 * Structural shape the parlay helpers operate on. The canonical persisted type
 * is `ParlayLeg` (from schemas-ext); it is assignable to this.
 */
export interface ParlayLegLike {
  pickOutcomeId: string;
  /** Decimal odds for this leg (used for the multiplier preview). null = even. */
  odds?: number | null;
  /** Resolved winner once known. */
  resultOutcomeId?: string | null;
}

export type LegResult = 'pending' | 'hit' | 'miss';

export function legResult(leg: ParlayLegLike): LegResult {
  if (leg.resultOutcomeId == null) return 'pending';
  return leg.resultOutcomeId === leg.pickOutcomeId ? 'hit' : 'miss';
}

/** A parlay slip hits only if EVERY leg hits. */
export function parlayHits(legs: ParlayLegLike[]): boolean {
  return legs.length > 0 && legs.every((l) => legResult(l) === 'hit');
}

/** True once any leg has missed — the slip is dead and can settle as a loss early. */
export function parlayBusted(legs: ParlayLegLike[]): boolean {
  return legs.some((l) => legResult(l) === 'miss');
}

/** Combined decimal multiplier of all legs (product of per-leg odds, default 2.0 each). */
export function parlayMultiplier(legs: ParlayLegLike[]): number {
  return legs.reduce((m, l) => m * (l.odds && l.odds > 1 ? l.odds : 2), 1);
}

/** Count of legs resolved so far / total. */
export function parlayProgress(legs: ParlayLegLike[]): { hit: number; resolved: number; total: number } {
  let hit = 0;
  let resolved = 0;
  for (const l of legs) {
    const r = legResult(l);
    if (r !== 'pending') resolved++;
    if (r === 'hit') hit++;
  }
  return { hit, resolved, total: legs.length };
}

// ─── Brackets / Tournaments (single elimination) ───────────────────────────────

export interface BracketSlot {
  slotId: string;
  /** Competitor name, or null for a bye / not-yet-determined. */
  name: string | null;
}

export interface BracketMatch {
  matchId: string;
  round: number; // 0 = first round
  a: BracketSlot;
  b: BracketSlot;
  winnerSlotId?: string | null;
}

/** Number of rounds for a field of N competitors (next power of two). */
export function bracketRounds(competitors: number): number {
  if (competitors <= 1) return 0;
  return Math.ceil(Math.log2(competitors));
}

/** Seed a single-elimination bracket from an ordered list of names. */
export function seedBracket(names: string[]): BracketMatch[] {
  const n = names.length;
  if (n < 2) return [];
  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const slots: BracketSlot[] = Array.from({ length: size }, (_, i) => ({
    slotId: `s${i}`,
    name: i < n ? names[i] : null,
  }));
  const matches: BracketMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    matches.push({
      matchId: `r0m${i / 2}`,
      round: 0,
      a: slots[i],
      b: slots[i + 1],
      // Auto-advance byes.
      winnerSlotId: slots[i + 1].name == null ? slots[i].slotId : slots[i].name == null ? slots[i + 1].slotId : null,
    });
  }
  return matches;
}

// ─── Squares (e.g. 10×10 game grid) ─────────────────────────────────────────────

export interface SquaresGrid {
  size: number; // typically 10
  /** uid claiming each cell, indexed [row*size + col]. */
  cells: (string | null)[];
  /** Row/col header digit assignment, set when the grid fills (0..9 shuffled). */
  rowDigits?: number[];
  colDigits?: number[];
  pricePerSquare: number;
}

export function newSquaresGrid(size = 10, pricePerSquare = 100): SquaresGrid {
  return { size, cells: Array(size * size).fill(null), pricePerSquare };
}

export function squaresFilled(grid: SquaresGrid): number {
  return grid.cells.filter(Boolean).length;
}

export function squaresIsFull(grid: SquaresGrid): boolean {
  return squaresFilled(grid) === grid.size * grid.size;
}

/** Resolve which cell wins for a given score, using the assigned header digits. */
export function squaresWinningCell(
  grid: SquaresGrid,
  scoreA: number,
  scoreB: number,
): number | null {
  if (!grid.rowDigits || !grid.colDigits) return null;
  const row = grid.rowDigits.indexOf(scoreA % 10);
  const col = grid.colDigits.indexOf(scoreB % 10);
  if (row < 0 || col < 0) return null;
  return row * grid.size + col;
}

/** Deterministic Fisher–Yates shuffle of [0..9] from an integer seed (no Math.random). */
export function shuffledDigits(seed: number): number[] {
  const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Power-up payout adjustments (pure preview/auth helpers) ─────────────────────

/** Apply 'insurance' to a losing payout: refund half the stake. */
export function insurancePayout(stake: number, won: boolean): number {
  assertChips(stake, 'stake');
  return won ? 0 : Math.floor(stake / 2);
}

/** 'Double or nothing' multiplier on profit when it hits (loss is total, handled by escrow). */
export const DOUBLE_OR_NOTHING_MULTIPLIER = 2;
