/**
 * Engagement-loop config + pure helpers (hourly drops, streak meter, variable
 * rewards, near-miss). Pure, no Firebase/React. Tuned for habit formation while
 * staying inside the virtual-Chips, no-cash-value pilot.
 */

// ─── Hourly chip drop (the "come back every hour" loop) ────────────────────────

export const HOURLY_DROP = {
  COOLDOWN_MS: 60 * 60 * 1000, // claimable once per hour
  /** Base reward; scales up with the claim streak (consecutive hours). */
  BASE: 50,
  STREAK_BONUS: 25, // per consecutive hourly claim
  STREAK_CAP: 12, // bonus caps at 12 in a row
  /** If you miss the window the streak resets after this grace. */
  RESET_AFTER_MS: 3 * 60 * 60 * 1000,
} as const;

export function hourlyDropAmount(streak: number): number {
  const s = Math.max(0, Math.min(HOURLY_DROP.STREAK_CAP, streak));
  return HOURLY_DROP.BASE + s * HOURLY_DROP.STREAK_BONUS;
}

/** ms remaining until the next hourly drop is claimable (0 = ready now). */
export function hourlyDropReadyIn(lastClaimAt: number | null, now: number): number {
  if (!lastClaimAt) return 0;
  return Math.max(0, lastClaimAt + HOURLY_DROP.COOLDOWN_MS - now);
}

// ─── Variable-reward chest (slot-like dopamine on opens) ───────────────────────

export type ChestTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface ChestReward {
  tier: ChestTier;
  chips: number;
}

/** Weighted chest reward table (RTP < total cost is enforced by the CF). */
export const CHEST_TABLE: { tier: ChestTier; chips: number; weight: number }[] = [
  { tier: 'common', chips: 50, weight: 50 },
  { tier: 'common', chips: 100, weight: 25 },
  { tier: 'rare', chips: 250, weight: 14 },
  { tier: 'epic', chips: 750, weight: 8 },
  { tier: 'legendary', chips: 5000, weight: 3 },
];

/** Roll a chest from a uniform random in [0,1). Deterministic given r. */
export function rollChest(r: number): ChestReward {
  const total = CHEST_TABLE.reduce((s, c) => s + c.weight, 0);
  let acc = 0;
  const x = r * total;
  for (const c of CHEST_TABLE) {
    acc += c.weight;
    if (x < acc) return { tier: c.tier, chips: c.chips };
  }
  const last = CHEST_TABLE[CHEST_TABLE.length - 1];
  return { tier: last.tier, chips: last.chips };
}

// ─── Daily-spin (free spin once a day) ─────────────────────────────────────────

export const DAILY_SPIN = {
  COOLDOWN_MS: 24 * 60 * 60 * 1000,
  PRIZES: [0, 25, 50, 75, 100, 150, 250, 500] as number[],
} as const;

// ─── Streak meter (consecutive days active) ────────────────────────────────────

/** A 0..1 progress toward the next streak milestone, for the meter UI. */
export function streakMeterProgress(streak: number): { progress: number; nextMilestone: number } {
  const milestones = [3, 7, 14, 30, 60, 100];
  const next = milestones.find((m) => m > streak) ?? streak + 1;
  const prev = [...milestones].reverse().find((m) => m <= streak) ?? 0;
  const span = Math.max(1, next - prev);
  return { progress: Math.min(1, (streak - prev) / span), nextMilestone: next };
}

// ─── "Heating up" — a bet/market gaining momentum (drives FOMO pushes) ──────────

/** Score how 'hot' something is from recent activity, for trending sort + pushes. */
export function heatScore(args: { joinsLastHour: number; volumeLastHour: number; ageMins: number }): number {
  const recency = Math.exp(-args.ageMins / 180); // decays over ~3h
  return (args.joinsLastHour * 3 + args.volumeLastHour / 100) * (0.5 + recency);
}
