/**
 * Zod schemas = the contract for every Firestore document and Cloud Function
 * payload. Shared by the app (validate reads, build writes) and Functions
 * (validate inputs before touching the ledger). Types are inferred from these
 * so the contract can never drift from the runtime check.
 *
 * Timestamps are stored as Firestore Timestamps server-side; over the wire to
 * callables and in the client cache we normalize to epoch millis (number) so
 * the schemas stay transport-agnostic.
 */

import { z } from 'zod';
import {
  BET_CATEGORY,
  BET_STATUS,
  BET_TYPE,
  BET_VISIBILITY,
  LEDGER_DIRECTION,
  LEDGER_REASON,
  MARKET_MODEL,
  RESOLUTION_MODE,
} from './constants';

const epochMillis = z.number().int().nonnegative();
const chips = z.number().int().nonnegative();
const handleRegex = /^[a-z0-9_]{3,20}$/;

export const zEnumFrom = <T extends Record<string, string>>(obj: T) =>
  z.enum(Object.values(obj) as [string, ...string[]]);

// ─── User ────────────────────────────────────────────────────────────────────

export const RgLimitsSchema = z.object({
  dailyStakeLimit: chips.nullable(),
  weeklyStakeLimit: chips.nullable(),
  dailyBetCountLimit: z.number().int().nonnegative().nullable(),
  sessionReminderMins: z.number().int().positive(),
  selfExclusionUntil: epochMillis.nullable(),
});

export const UserSettingsSchema = z.object({
  pushEnabled: z.boolean().default(true),
  notifyOnJoin: z.boolean().default(true),
  notifyOnResolve: z.boolean().default(true),
  notifyOnComment: z.boolean().default(true),
  privacy: z.enum(['public', 'friends', 'private']).default('friends'),
  reduceMotion: z.boolean().default(false),
  biometricGate: z.boolean().default(false),
});

export const UserSchema = z.object({
  uid: z.string(),
  displayName: z.string().min(1).max(40),
  handle: z.string().regex(handleRegex),
  photoURL: z.string().url().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  authProviders: z.array(z.string()).default([]),
  createdAt: epochMillis,
  // Compliance — server-trusted, write-once.
  ageVerified: z.boolean().default(false),
  dateOfBirth: epochMillis.nullable().optional(),
  kycLevel: z.enum(['none', 'self_attested', 'verified']).default('none'),
  region: z.string().length(2).default('MO'),
  locale: z.string().default('en'),
  // Money — CF-write-only (denormalized; ledger is source of truth).
  chipsBalance: chips.default(0),
  chipsHeld: chips.default(0),
  ledgerVersion: z.number().int().nonnegative().default(0),
  // Stats.
  lifetimeWagered: chips.default(0),
  lifetimeWon: chips.default(0),
  winCount: z.number().int().nonnegative().default(0),
  lossCount: z.number().int().nonnegative().default(0),
  currentStreak: z.number().int().default(0),
  bestStreak: z.number().int().nonnegative().default(0),
  xp: z.number().int().nonnegative().default(0),
  level: z.number().int().positive().default(1),
  // Responsible gaming.
  rgLimits: RgLimitsSchema,
  rgState: z.object({
    todayStaked: chips.default(0),
    weekStaked: chips.default(0),
    todayBetCount: z.number().int().nonnegative().default(0),
    lastResetAt: epochMillis.default(0),
  }),
  // Daily economy.
  lastDailyGrantAt: epochMillis.nullable().optional(),
  lastZeroRefillAt: epochMillis.nullable().optional(),
  dailyStreak: z.number().int().nonnegative().default(0),
  // Social / referral.
  referredBy: z.string().nullable().optional(),
  referralCode: z.string().optional(),
  // Admin / safety.
  isBanned: z.boolean().default(false),
  flags: z
    .object({ shadowBanned: z.boolean().default(false), frozen: z.boolean().default(false) })
    .default({ shadowBanned: false, frozen: false }),
  settings: UserSettingsSchema,
});
export type User = z.infer<typeof UserSchema>;

// ─── Bet ─────────────────────────────────────────────────────────────────────

export const OutcomeSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(60),
  /** decimal odds for FIXED_ODDS_P2P; null for pari-mutuel split. */
  odds: z.number().positive().nullable().optional(),
  color: z.string().optional(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const BetSchema = z.object({
  betId: z.string(),
  creatorUid: z.string(),
  title: z.string().min(3).max(120),
  description: z.string().max(500).default(''),
  category: zEnumFrom(BET_CATEGORY).default(BET_CATEGORY.CUSTOM),
  mediaPath: z.string().nullable().optional(),
  type: zEnumFrom(BET_TYPE),
  outcomes: z.array(OutcomeSchema).min(2).max(12),
  marketModel: zEnumFrom(MARKET_MODEL).default(MARKET_MODEL.PARI_MUTUEL),
  stakeMode: z.enum(['fixed', 'open']).default('open'),
  fixedStakeAmount: chips.nullable().optional(),
  minStake: chips,
  maxStake: chips.nullable().optional(),
  currency: z.string().default('CHIP'),
  rakeBps: z.number().int().min(0).max(10_000).default(0),
  visibility: zEnumFrom(BET_VISIBILITY).default(BET_VISIBILITY.FRIENDS),
  groupId: z.string().nullable().optional(),
  status: zEnumFrom(BET_STATUS).default(BET_STATUS.OPEN),
  resolutionMode: zEnumFrom(RESOLUTION_MODE).default(RESOLUTION_MODE.CREATOR),
  resolverUid: z.string().nullable().optional(),
  consensusThreshold: z.number().min(0).max(1).nullable().optional(),
  oracleRef: z.string().nullable().optional(),
  lockAt: epochMillis,
  resolveBy: epochMillis,
  winningOutcomeId: z.string().nullable().optional(),
  proposedOutcomeId: z.string().nullable().optional(),
  // CF-maintained financials.
  poolTotal: chips.default(0),
  poolByOutcome: z.record(z.string(), chips).default({}),
  entryCount: z.number().int().nonnegative().default(0),
  settlementId: z.string().nullable().optional(),
  // Timestamps.
  createdAt: epochMillis,
  lockedAt: epochMillis.nullable().optional(),
  resolvedAt: epochMillis.nullable().optional(),
  settledAt: epochMillis.nullable().optional(),
  disputeWindowEndsAt: epochMillis.nullable().optional(),
  idempotencyKey: z.string().optional(),
  shareCode: z.string(),
  tags: z.array(z.string()).default([]),
  // ── Location ("in your area" bets) ──
  // When isLocal, the bet is discoverable by anyone within radiusMeters of its
  // (privacy-fuzzed) coordinates. lat/lng are already coarsened server-side; the
  // geohash is for cheap radius queries; placeName is a coarse neighborhood label.
  isLocal: z.boolean().default(false),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  geohash: z.string().nullable().optional(),
  placeName: z.string().nullable().optional(),
  radiusMeters: z.number().int().positive().nullable().optional(),
  // Denormalized creator card.
  creatorName: z.string().optional(),
  creatorPhotoURL: z.string().nullable().optional(),
});
export type Bet = z.infer<typeof BetSchema>;

export const BetEntrySchema = z.object({
  uid: z.string(),
  betId: z.string(),
  outcomeId: z.string(),
  stake: chips,
  status: z.enum(['placed', 'won', 'lost', 'refunded', 'void']).default('placed'),
  ledgerEntryIdEscrow: z.string(),
  ledgerEntryIdPayout: z.string().nullable().optional(),
  payoutAmount: chips.nullable().optional(),
  joinedAt: epochMillis,
  // Denormalized for cheap participant lists.
  displayName: z.string().optional(),
  photoURL: z.string().nullable().optional(),
});
export type BetEntry = z.infer<typeof BetEntrySchema>;

export const VoteSchema = z.object({
  uid: z.string(),
  outcomeId: z.string(),
  createdAt: epochMillis,
});
export type Vote = z.infer<typeof VoteSchema>;

export const DisputeSchema = z.object({
  disputeId: z.string(),
  raisedBy: z.string(),
  reason: z.string().max(500),
  evidencePath: z.string().nullable().optional(),
  status: z.enum(['open', 'upheld', 'rejected']).default('open'),
  createdAt: epochMillis,
  resolvedAt: epochMillis.nullable().optional(),
});
export type Dispute = z.infer<typeof DisputeSchema>;

export const CommentSchema = z.object({
  commentId: z.string(),
  authorUid: z.string(),
  authorName: z.string(),
  authorPhotoURL: z.string().nullable().optional(),
  text: z.string().min(1).max(280),
  gifUrl: z.string().url().nullable().optional(),
  createdAt: epochMillis,
  reactionCounts: z.record(z.string(), z.number().int()).default({}),
});
export type Comment = z.infer<typeof CommentSchema>;

// ─── Ledger (financial-grade, append-only) ─────────────────────────────────────

export const LedgerEntrySchema = z.object({
  entryId: z.string(), // ULID — sortable
  uid: z.string(),
  seq: z.number().int().nonnegative(), // monotonic per-user
  direction: zEnumFrom(LEDGER_DIRECTION),
  reason: zEnumFrom(LEDGER_REASON),
  amount: chips, // always positive; direction gives the sign
  /** Balance and held AFTER applying this entry — lets us audit by replay. */
  balanceAfter: chips,
  heldAfter: chips,
  currency: z.string().default('CHIP'),
  betId: z.string().nullable().optional(),
  /** Groups the legs of one logical transaction (e.g. debit+escrow). */
  txnGroupId: z.string(),
  idempotencyKey: z.string(),
  memo: z.string().optional(),
  createdAt: epochMillis,
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const SettlementSchema = z.object({
  betId: z.string(),
  model: z.enum(['PARI_MUTUEL', 'WINNER_TAKE_ALL', 'REFUND_ALL']),
  winningOutcomeId: z.string().nullable(),
  pool: chips,
  rake: chips,
  payoutTotal: chips,
  /** Conservation proof: payoutTotal + rake === pool. */
  checksum: z.boolean(),
  payouts: z.array(
    z.object({ uid: z.string(), amount: chips, profit: z.number().int() }),
  ),
  settledAt: epochMillis,
  settledBy: z.string(), // 'system' | adminUid
});
export type Settlement = z.infer<typeof SettlementSchema>;

// ─── Social ────────────────────────────────────────────────────────────────────

export const FriendSchema = z.object({
  friendUid: z.string(),
  status: z.enum(['pending_out', 'pending_in', 'accepted', 'blocked']),
  createdAt: epochMillis,
  displayNameCache: z.string().optional(),
  photoURLCache: z.string().nullable().optional(),
  handleCache: z.string().optional(),
});
export type Friend = z.infer<typeof FriendSchema>;

export const GroupSchema = z.object({
  groupId: z.string(),
  name: z.string().min(1).max(40),
  description: z.string().max(200).default(''),
  emoji: z.string().default('🎲'),
  ownerUid: z.string(),
  memberCount: z.number().int().nonnegative().default(1),
  createdAt: epochMillis,
  inviteCode: z.string(),
  coverColor: z.string().default('#6C5CE7'),
});
export type Group = z.infer<typeof GroupSchema>;

export const FeedItemSchema = z.object({
  itemId: z.string(),
  type: z.enum([
    'bet_created',
    'bet_joined',
    'bet_resolving',
    'bet_settled',
    'big_win',
    'friend_joined',
    'achievement',
  ]),
  actorUid: z.string(),
  actorName: z.string(),
  actorPhotoURL: z.string().nullable().optional(),
  betId: z.string().nullable().optional(),
  betTitle: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  amount: chips.nullable().optional(),
  createdAt: epochMillis,
  read: z.boolean().default(false),
});
export type FeedItem = z.infer<typeof FeedItemSchema>;

export const NotificationSchema = z.object({
  notifId: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  betId: z.string().nullable().optional(),
  deepLink: z.string().nullable().optional(),
  createdAt: epochMillis,
  read: z.boolean().default(false),
});
export type AppNotification = z.infer<typeof NotificationSchema>;

export const AchievementSchema = z.object({
  achievementId: z.string(),
  key: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
  unlockedAt: epochMillis,
  tier: z.enum(['bronze', 'silver', 'gold']).default('bronze'),
});
export type Achievement = z.infer<typeof AchievementSchema>;

export const LeaderboardRowSchema = z.object({
  uid: z.string(),
  displayName: z.string(),
  photoURL: z.string().nullable().optional(),
  handle: z.string().optional(),
  rank: z.number().int().positive(),
  netChips: z.number().int(),
  winCount: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  currentStreak: z.number().int(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRowSchema>;

// ─── Cloud Function payloads ───────────────────────────────────────────────────

export const VerifyAgePayloadSchema = z.object({
  dateOfBirth: epochMillis,
  region: z.string().length(2).optional(),
  referralCode: z.string().optional(),
});

export const CreateBetPayloadSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  category: zEnumFrom(BET_CATEGORY).optional(),
  type: zEnumFrom(BET_TYPE),
  outcomes: z.array(z.object({ label: z.string().min(1).max(60), odds: z.number().positive().nullable().optional() })).min(2).max(12),
  marketModel: zEnumFrom(MARKET_MODEL).optional(),
  stakeMode: z.enum(['fixed', 'open']).optional(),
  fixedStakeAmount: chips.nullable().optional(),
  minStake: chips.optional(),
  maxStake: chips.nullable().optional(),
  visibility: zEnumFrom(BET_VISIBILITY).optional(),
  groupId: z.string().nullable().optional(),
  resolutionMode: zEnumFrom(RESOLUTION_MODE).optional(),
  consensusThreshold: z.number().min(0).max(1).nullable().optional(),
  lockAt: epochMillis,
  resolveBy: epochMillis,
  mediaPath: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  // Location ("in your area"): the client sends its coarse position + a place
  // label; the server re-fuzzes + geohashes before storing. radiusMeters caps
  // who can discover it. Only used when the bet is made local.
  isLocal: z.boolean().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  placeName: z.string().max(80).nullable().optional(),
  radiusMeters: z.number().int().positive().max(200_000).optional(),
  idempotencyKey: z.string(),
});
export type CreateBetPayload = z.infer<typeof CreateBetPayloadSchema>;

export const PlaceBetPayloadSchema = z.object({
  betId: z.string(),
  outcomeId: z.string(),
  stake: chips,
  idempotencyKey: z.string(),
});
export type PlaceBetPayload = z.infer<typeof PlaceBetPayloadSchema>;

export const ResolveBetPayloadSchema = z.object({
  betId: z.string(),
  winningOutcomeId: z.string(),
  evidencePath: z.string().nullable().optional(),
});

export const SetRgLimitsPayloadSchema = z.object({
  dailyStakeLimit: chips.nullable().optional(),
  weeklyStakeLimit: chips.nullable().optional(),
  dailyBetCountLimit: z.number().int().nonnegative().nullable().optional(),
  sessionReminderMins: z.number().int().positive().optional(),
  selfExcludeForMs: z.number().int().nonnegative().nullable().optional(),
});
