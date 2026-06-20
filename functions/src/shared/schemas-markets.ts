/**
 * Schemas for the markets / casino / engagement / discovery feature set.
 * Separate file; re-exported via the shared barrel. Timestamps are epoch millis.
 * Money/positions/outcomes are CF-written only — clients read these and mutate
 * via callables.
 */
import { z } from 'zod';

const epochMillis = z.number().int().nonnegative();
const chips = z.number().int().nonnegative();

// ─── Prediction markets (Kalshi-style YES/NO) ──────────────────────────────────

export const MarketSchema = z.object({
  marketId: z.string(),
  creatorUid: z.string(),
  question: z.string().min(6).max(140),
  description: z.string().max(500).default(''),
  category: z.string().default('custom'),
  imageUrl: z.string().url().nullable().optional(),
  // LMSR AMM state (CF-write-only).
  qYes: z.number().default(0),
  qNo: z.number().default(0),
  b: z.number().positive(), // liquidity depth
  /** Cached integer cents price of YES, 1..99 (denormalized for cheap reads/sort). */
  priceYesCents: z.number().int().min(1).max(99).default(50),
  /** Total Chips traded (volume) — drives trending. */
  volume: chips.default(0),
  traderCount: z.number().int().nonnegative().default(0),
  status: z.enum(['open', 'closed', 'resolved', 'voided']).default('open'),
  resolution: z.enum(['yes', 'no']).nullable().optional(),
  closesAt: epochMillis,
  resolvesBy: epochMillis,
  resolvedAt: epochMillis.nullable().optional(),
  createdAt: epochMillis,
  oracleRef: z.string().nullable().optional(),
  // Denormalized creator card + trending.
  creatorName: z.string().optional(),
  heat: z.number().default(0),
});
export type Market = z.infer<typeof MarketSchema>;

export const MarketPositionSchema = z.object({
  uid: z.string(),
  marketId: z.string(),
  yesShares: z.number().nonnegative().default(0),
  noShares: z.number().nonnegative().default(0),
  /** Chips spent net of sells — for P/L display. */
  costBasis: z.number().int().default(0),
  realizedPnl: z.number().int().default(0),
  updatedAt: epochMillis,
  displayName: z.string().optional(),
  photoURL: z.string().nullable().optional(),
});
export type MarketPosition = z.infer<typeof MarketPositionSchema>;

export const MarketTradeSchema = z.object({
  tradeId: z.string(),
  marketId: z.string(),
  uid: z.string(),
  side: z.enum(['yes', 'no']),
  action: z.enum(['buy', 'sell']),
  shares: z.number(),
  cost: z.number().int(), // +spent on buy, -proceeds on sell
  priceCents: z.number().int(),
  createdAt: epochMillis,
});
export type MarketTrade = z.infer<typeof MarketTradeSchema>;

// ─── Casino game rounds (provably fair) ────────────────────────────────────────

export const GameRoundSchema = z.object({
  roundId: z.string(),
  uid: z.string(),
  game: z.enum(['slots', 'wheel', 'scratch', 'coinflip', 'crash']),
  stake: chips,
  multiplier: z.number().nonnegative(),
  payout: chips,
  net: z.number().int(),
  // Provably-fair commitment/reveal.
  serverSeedHash: z.string(),
  serverSeed: z.string().nullable().optional(), // revealed after the round
  clientSeed: z.string(),
  nonce: z.number().int().nonnegative(),
  /** Game-specific result blob (reels, segment, cells, crash point, etc.). */
  result: z.record(z.string(), z.any()).default({}),
  createdAt: epochMillis,
});
export type GameRound = z.infer<typeof GameRoundSchema>;

// ─── Engagement state (on the user doc; CF-written) ────────────────────────────

export const EngagementStateSchema = z.object({
  hourlyStreak: z.number().int().nonnegative().default(0),
  lastHourlyClaimAt: epochMillis.nullable().optional(),
  lastDailySpinAt: epochMillis.nullable().optional(),
  dayStreak: z.number().int().nonnegative().default(0),
  lastActiveDay: z.string().optional(), // 'YYYY-MM-DD' Macau
  chestsOpened: z.number().int().nonnegative().default(0),
  totalSpins: z.number().int().nonnegative().default(0),
});
export type EngagementState = z.infer<typeof EngagementStateSchema>;

// ─── Discovery feed item (denormalized, fan-out or query-built) ────────────────

export const DiscoveryItemSchema = z.object({
  itemId: z.string(),
  kind: z.enum(['market', 'bet', 'big_win', 'game_win']),
  refId: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  imageUrl: z.string().url().nullable().optional(),
  priceYesCents: z.number().int().nullable().optional(),
  poolTotal: chips.nullable().optional(),
  heat: z.number().default(0),
  actorName: z.string().optional(),
  actorPhotoURL: z.string().nullable().optional(),
  amount: chips.nullable().optional(),
  createdAt: epochMillis,
});
export type DiscoveryItem = z.infer<typeof DiscoveryItemSchema>;

// ─── Cloud Function payloads ───────────────────────────────────────────────────

export const CreateMarketPayloadSchema = z.object({
  question: z.string().min(6).max(140),
  description: z.string().max(500).optional(),
  category: z.string().optional(),
  closesAt: epochMillis,
  resolvesBy: epochMillis,
  seedChips: chips.optional(), // creator-seeded liquidity (optional)
  imageUrl: z.string().url().nullable().optional(),
  idempotencyKey: z.string(),
});
export type CreateMarketPayload = z.infer<typeof CreateMarketPayloadSchema>;

export const TradeMarketPayloadSchema = z.object({
  marketId: z.string(),
  side: z.enum(['yes', 'no']),
  action: z.enum(['buy', 'sell']),
  /** For buy: Chip budget. For sell: number of shares. */
  amount: z.number().positive(),
  idempotencyKey: z.string(),
});
export type TradeMarketPayload = z.infer<typeof TradeMarketPayloadSchema>;

export const ResolveMarketPayloadSchema = z.object({
  marketId: z.string(),
  resolution: z.enum(['yes', 'no']),
});

export const PlayGamePayloadSchema = z.object({
  game: z.enum(['slots', 'wheel', 'scratch', 'coinflip', 'crash']),
  stake: chips,
  clientSeed: z.string().min(1).max(64),
  /** Game params: coinflip pick, crash cashout multiplier, etc. */
  params: z.record(z.string(), z.any()).optional(),
  idempotencyKey: z.string(),
});
export type PlayGamePayload = z.infer<typeof PlayGamePayloadSchema>;

export const ClaimHourlyDropPayloadSchema = z.object({});
export const OpenChestPayloadSchema = z.object({ idempotencyKey: z.string() });
export const DailySpinPayloadSchema = z.object({ clientSeed: z.string().min(1).max(64) });
