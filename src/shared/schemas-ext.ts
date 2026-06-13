/**
 * Expansion schemas (gamification, formats, economy, social depth, sports).
 * Kept in a separate file from the core schemas.ts; re-exported via the barrel.
 * Timestamps are epoch millis (number) on the client, same convention as core.
 */
import { z } from 'zod';

const epochMillis = z.number().int().nonnegative();
const chips = z.number().int().nonnegative();

// ─── Gamification ──────────────────────────────────────────────────────────────

export const UserAchievementSchema = z.object({
  achievementId: z.string(),
  key: z.string(),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
  unlockedAt: epochMillis,
  rewardGranted: chips,
});
export type UserAchievement = z.infer<typeof UserAchievementSchema>;

export const UserMissionSchema = z.object({
  missionId: z.string(), // `${period}:${key}:${periodId}`
  key: z.string(),
  period: z.enum(['daily', 'weekly']),
  periodId: z.string(), // e.g. '2026-06-13' or '2026-W24'
  progress: z.number().int().nonnegative().default(0),
  target: z.number().int().positive(),
  completed: z.boolean().default(false),
  claimed: z.boolean().default(false),
  reward: chips,
  xp: z.number().int().nonnegative(),
  expiresAt: epochMillis,
});
export type UserMission = z.infer<typeof UserMissionSchema>;

export const SeasonSchema = z.object({
  seasonId: z.string(),
  name: z.string(),
  startsAt: epochMillis,
  endsAt: epochMillis,
  active: z.boolean(),
  number: z.number().int().positive(),
});
export type Season = z.infer<typeof SeasonSchema>;

export const SeasonStandingSchema = z.object({
  uid: z.string(),
  displayName: z.string(),
  photoURL: z.string().nullable().optional(),
  netChips: z.number().int(),
  winCount: z.number().int().nonnegative(),
  xpEarned: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
});
export type SeasonStanding = z.infer<typeof SeasonStandingSchema>;

export const WrappedSchema = z.object({
  uid: z.string(),
  periodLabel: z.string(),
  betsPlaced: z.number().int().nonnegative(),
  betsWon: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  chipsWagered: chips,
  netChips: z.number().int(),
  biggestWin: chips,
  longestStreak: z.number().int().nonnegative(),
  favoriteCategory: z.string(),
  topRival: z.string().nullable().optional(),
  generatedAt: epochMillis,
});
export type Wrapped = z.infer<typeof WrappedSchema>;

// ─── Inventory / Cosmetics / Pro ─────────────────────────────────────────────────

export const InventoryItemSchema = z.object({
  itemId: z.string(),
  cosmeticKey: z.string(),
  type: z.enum(['card_skin', 'avatar_frame', 'sticker_pack', 'name_color', 'win_effect']),
  acquiredAt: epochMillis,
  equipped: z.boolean().default(false),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const EquippedCosmeticsSchema = z.object({
  card_skin: z.string().nullable().optional(),
  avatar_frame: z.string().nullable().optional(),
  name_color: z.string().nullable().optional(),
  win_effect: z.string().nullable().optional(),
});
export type EquippedCosmetics = z.infer<typeof EquippedCosmeticsSchema>;

export const ProStatusSchema = z.object({
  active: z.boolean(),
  since: epochMillis.nullable().optional(),
  expiresAt: epochMillis.nullable().optional(),
});
export type ProStatus = z.infer<typeof ProStatusSchema>;

// ─── Power-ups ───────────────────────────────────────────────────────────────

export const PowerUpInventorySchema = z.object({
  key: z.string(),
  count: z.number().int().nonnegative(),
});
export type PowerUpInventory = z.infer<typeof PowerUpInventorySchema>;

// ─── Parlays ─────────────────────────────────────────────────────────────────

export const ParlayLegSchema = z.object({
  legId: z.string(),
  betId: z.string().nullable().optional(),
  fixtureId: z.string().nullable().optional(),
  label: z.string(),
  pickOutcomeId: z.string(),
  odds: z.number().positive().nullable().optional(),
  resultOutcomeId: z.string().nullable().optional(),
});
export type ParlayLeg = z.infer<typeof ParlayLegSchema>;

export const ParlaySlipSchema = z.object({
  slipId: z.string(),
  uid: z.string(),
  displayName: z.string().optional(),
  photoURL: z.string().nullable().optional(),
  legs: z.array(ParlayLegSchema).min(2).max(12),
  stake: chips,
  multiplier: z.number().positive(),
  status: z.enum(['live', 'hit', 'busted', 'settled']).default('live'),
  payout: chips.nullable().optional(),
  createdAt: epochMillis,
});
export type ParlaySlip = z.infer<typeof ParlaySlipSchema>;

// ─── Brackets ────────────────────────────────────────────────────────────────

export const BracketSchema = z.object({
  bracketId: z.string(),
  title: z.string(),
  groupId: z.string().nullable().optional(),
  competitors: z.array(z.string()),
  matches: z.array(
    z.object({
      matchId: z.string(),
      round: z.number().int().nonnegative(),
      aName: z.string().nullable(),
      bName: z.string().nullable(),
      winnerName: z.string().nullable().optional(),
    }),
  ),
  entryFee: chips,
  poolTotal: chips.default(0),
  status: z.enum(['open', 'live', 'settled']).default('open'),
  createdAt: epochMillis,
});
export type Bracket = z.infer<typeof BracketSchema>;

// ─── Squares ─────────────────────────────────────────────────────────────────

export const SquaresGameSchema = z.object({
  gameId: z.string(),
  title: z.string(),
  size: z.number().int().positive().default(10),
  pricePerSquare: chips,
  cells: z.array(z.string().nullable()),
  rowDigits: z.array(z.number().int()).nullable().optional(),
  colDigits: z.array(z.number().int()).nullable().optional(),
  poolTotal: chips.default(0),
  groupId: z.string().nullable().optional(),
  status: z.enum(['open', 'locked', 'settled']).default('open'),
  createdAt: epochMillis,
});
export type SquaresGame = z.infer<typeof SquaresGameSchema>;

// ─── Sports fixtures ─────────────────────────────────────────────────────────

export const FixtureSchema = z.object({
  fixtureId: z.string(),
  league: z.string(),
  sport: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeLogo: z.string().nullable().optional(),
  awayLogo: z.string().nullable().optional(),
  startsAt: epochMillis,
  status: z.enum(['scheduled', 'live', 'final']).default('scheduled'),
  homeScore: z.number().int().nullable().optional(),
  awayScore: z.number().int().nullable().optional(),
  period: z.string().nullable().optional(),
  winner: z.enum(['home', 'away', 'draw']).nullable().optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

// ─── Rivalries (head-to-head) ─────────────────────────────────────────────────

export const RivalrySchema = z.object({
  pairId: z.string(), // sorted uid pair
  uidA: z.string(),
  uidB: z.string(),
  aWins: z.number().int().nonnegative().default(0),
  bWins: z.number().int().nonnegative().default(0),
  totalBets: z.number().int().nonnegative().default(0),
  aNetChips: z.number().int().default(0),
  lastBetAt: epochMillis.nullable().optional(),
});
export type Rivalry = z.infer<typeof RivalrySchema>;

// ─── Crew chat ───────────────────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  messageId: z.string(),
  groupId: z.string(),
  authorUid: z.string(),
  authorName: z.string(),
  authorPhotoURL: z.string().nullable().optional(),
  text: z.string().max(500).default(''),
  gifUrl: z.string().url().nullable().optional(),
  stickerKey: z.string().nullable().optional(),
  betRef: z.string().nullable().optional(), // shared bet card
  createdAt: epochMillis,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ─── Cloud Function payloads (expansion) ───────────────────────────────────────

export const ClaimMissionPayloadSchema = z.object({ missionId: z.string() });
export const BuyCosmeticPayloadSchema = z.object({ cosmeticKey: z.string() });
export const EquipCosmeticPayloadSchema = z.object({
  type: z.enum(['card_skin', 'avatar_frame', 'sticker_pack', 'name_color', 'win_effect']),
  cosmeticKey: z.string().nullable(),
});
export const BuyPowerUpPayloadSchema = z.object({ key: z.string(), count: z.number().int().positive().max(20).default(1) });
export const SubscribeProPayloadSchema = z.object({});
export const CreateParlayPayloadSchema = z.object({
  legs: z.array(ParlayLegSchema.pick({ betId: true, fixtureId: true, label: true, pickOutcomeId: true, odds: true })).min(2).max(12),
  stake: chips,
  idempotencyKey: z.string(),
});
export const CreateSquaresPayloadSchema = z.object({
  title: z.string().min(3).max(80),
  pricePerSquare: chips,
  groupId: z.string().nullable().optional(),
});
export const ClaimSquarePayloadSchema = z.object({ gameId: z.string(), cellIndex: z.number().int().nonnegative() });
export const SendChatPayloadSchema = z.object({
  groupId: z.string(),
  text: z.string().max(500).optional(),
  gifUrl: z.string().url().nullable().optional(),
  stickerKey: z.string().nullable().optional(),
  betRef: z.string().nullable().optional(),
});
export const ChallengeFriendPayloadSchema = z.object({
  friendUid: z.string(),
  title: z.string().min(3).max(120),
  stake: chips,
  myOutcomeLabel: z.string().min(1).max(60),
  theirOutcomeLabel: z.string().min(1).max(60),
  lockAt: epochMillis,
  resolveBy: epochMillis,
  idempotencyKey: z.string(),
});
