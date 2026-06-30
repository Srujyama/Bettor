/**
 * Chipd shared constants — the single source of economic + rule truth.
 * Imported by BOTH the mobile app (display/preview) and Cloud Functions
 * (authoritative). Keep this pure: no Firebase, no React, no env.
 *
 * COMPLIANCE: Chips are a closed-loop, non-redeemable entertainment token.
 * There is no on-ramp (cash → Chips) and no off-ramp (Chips → cash) in v1.
 */

/** Hard flag. Real money is dormant architecture only; never flip without a license. */
export const IS_REAL_MONEY = false as const;

/** The only currency in the pilot. The ledger is currency-agnostic for the future. */
export const CURRENCY = 'CHIP' as const;
export type Currency = typeof CURRENCY | 'HKD' | 'USD' | 'MOP';

/** Pilot market. Drives timezone, defaults, and which compliance copy shows. */
export const PILOT_REGION = 'MO' as const; // Macau (ISO 3166-1 alpha-2)
export const TIMEZONE = 'Asia/Macau' as const;

/** Economy parameters. In production these mirror Remote Config so they can flex without a release. */
export const ECONOMY = {
  /** Chips granted once when a user verifies they are 18+. */
  SIGNUP_GRANT: 1_000,
  /** Chips granted on a daily check-in (server-clamped to once per Macau day). */
  DAILY_GRANT: 100,
  /** Streak bonus per consecutive day, capped. */
  DAILY_STREAK_BONUS: 25,
  DAILY_STREAK_BONUS_CAP: 250,
  /** If a user hits zero, they may claim a free refill after this cooldown. */
  ZERO_REFILL_AMOUNT: 250,
  ZERO_REFILL_COOLDOWN_MS: 6 * 60 * 60 * 1000, // 6h
  /** House rake in basis points. ZERO in the pilot (P2B P2P, no commission). */
  RAKE_BPS: 0,
  /** Chips a referrer earns when an invited friend joins their first bet. */
  REFERRAL_BONUS: 200,
} as const;

/** Stake bounds. Chips are integers — there are no fractional Chips. */
export const STAKE = {
  MIN: 10,
  /** Default per-bet ceiling; a bet may set a lower max. */
  DEFAULT_MAX: 10_000,
  /** Hard ceiling regardless of bet settings (anti-blowout). */
  ABSOLUTE_MAX: 1_000_000,
} as const;

/** Common chip denominations for the staking UI. */
export const CHIP_DENOMINATIONS = [10, 25, 50, 100, 250, 500, 1_000] as const;

/** Default responsible-gaming limits applied to every new account. */
export const RG_DEFAULTS = {
  /** Max Chips a user can stake in a Macau day before being blocked. null = no limit. */
  dailyStakeLimit: null as number | null,
  weeklyStakeLimit: null as number | null,
  /** Max number of bets a user can join per day. null = no limit. */
  dailyBetCountLimit: null as number | null,
  /** Show a "you've been playing for N minutes" reality check at this cadence. */
  sessionReminderMins: 45,
  /** Self-exclusion end; null = not excluded. */
  selfExclusionUntil: null as number | null,
} as const;

/** Bet lifecycle states. A strict state machine governs transitions (see betStateMachine.ts). */
export const BET_STATUS = {
  DRAFT: 'draft',
  OPEN: 'open',
  LOCKED: 'locked',
  PENDING_RESOLUTION: 'pending_resolution',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
  SETTLED: 'settled',
  CANCELLED: 'cancelled',
  VOIDED: 'voided',
} as const;
export type BetStatus = (typeof BET_STATUS)[keyof typeof BET_STATUS];

/** Market models — how the pot is divided among winners. */
export const MARKET_MODEL = {
  /** Winners split the entire pool pro-rata to their stake. The default. */
  PARI_MUTUEL: 'PARI_MUTUEL',
  /** Single winning side takes the whole pot (head-to-head, binary). */
  WINNER_TAKE_ALL: 'WINNER_TAKE_ALL',
  /** Matched peer offers at fixed decimal odds (future; stubbed in v1). */
  FIXED_ODDS_P2P: 'FIXED_ODDS_P2P',
} as const;
export type MarketModel = (typeof MARKET_MODEL)[keyof typeof MARKET_MODEL];

/** Bet shapes presented in the create wizard. */
export const BET_TYPE = {
  BINARY: 'binary', // Yes / No
  MULTI: 'multi_outcome', // pick one of N options
  OVER_UNDER: 'over_under', // a numeric line
  HEAD_TO_HEAD: 'head_to_head', // me vs you
  POOL: 'pooled_pari_mutuel', // many sides, split the pot
} as const;
export type BetType = (typeof BET_TYPE)[keyof typeof BET_TYPE];

/** Who is allowed to declare the winning outcome. */
export const RESOLUTION_MODE = {
  CREATOR: 'creator', // creator (or appointed judge) calls it
  CONSENSUS: 'consensus', // quorum of participants must agree
  ORACLE: 'oracle', // trusted data source auto-resolves (future)
  ADMIN: 'admin', // trust & safety only
} as const;
export type ResolutionMode = (typeof RESOLUTION_MODE)[keyof typeof RESOLUTION_MODE];

export const BET_VISIBILITY = {
  PUBLIC: 'public',
  FRIENDS: 'friends',
  INVITE_ONLY: 'invite_only',
  GROUP: 'group',
  /** Discoverable by anyone physically near the bet's location (radius-based). */
  LOCAL: 'local',
} as const;
export type BetVisibility = (typeof BET_VISIBILITY)[keyof typeof BET_VISIBILITY];

export const BET_CATEGORY = {
  SPORTS: 'sports',
  WEATHER: 'weather',
  SOCIAL: 'social',
  GAMING: 'gaming',
  CUSTOM: 'custom',
  PROP: 'prop',
} as const;
export type BetCategory = (typeof BET_CATEGORY)[keyof typeof BET_CATEGORY];

/** Reasons a ledger entry can exist. Every Chip movement is one of these. */
export const LEDGER_REASON = {
  SIGNUP_GRANT: 'signup_grant',
  DAILY_GRANT: 'daily_grant',
  ZERO_REFILL: 'zero_refill',
  REFERRAL_BONUS: 'referral_bonus',
  ACHIEVEMENT_GRANT: 'achievement_grant',
  STAKE_ESCROW: 'stake_escrow', // debit on join (held)
  STAKE_REFUND: 'stake_refund', // credit on cancel/void
  PAYOUT: 'payout', // credit to winners on settle
  RAKE: 'rake', // house commission (0 in pilot)
  ADMIN_ADJUSTMENT: 'admin_adjustment', // trust & safety
  REVERSAL: 'reversal', // compensating entry (never edit)
  // ── expansion economy ──
  MISSION_REWARD: 'mission_reward', // completing a daily/weekly mission
  SEASON_REWARD: 'season_reward', // end-of-season placement reward
  LEVEL_UP_REWARD: 'level_up_reward', // reaching a new level
  STREAK_REWARD: 'streak_reward', // login / win streak milestone
  SHOP_PURCHASE: 'shop_purchase', // debit to buy a cosmetic / power-up
  POWERUP_USE: 'powerup_use', // debit to activate a power-up
  POWERUP_PAYOUT: 'powerup_payout', // credit from a power-up resolving (e.g. insurance)
  PRO_SUBSCRIPTION: 'pro_subscription', // debit for a Pro period (Chips, cosmetic-tier)
  GIFT_SENT: 'gift_sent', // debit: co-bet contribution on a friend's behalf (inside a bet)
  GIFT_RECEIVED: 'gift_received', // credit counterpart
  // ── markets (Kalshi-style yes/no prediction markets, Chips only) ──
  MARKET_BUY: 'market_buy', // debit: buying YES/NO shares
  MARKET_SELL: 'market_sell', // credit: selling shares back to the AMM
  MARKET_PAYOUT: 'market_payout', // credit: winning shares pay 100 Chips each at resolve
  MARKET_REFUND: 'market_refund', // credit: shares refunded on a voided market
  // ── casino mini-games (provably fair, house-edge, Chips only) ──
  GAME_WAGER: 'game_wager', // debit: stake into a casino mini-game
  GAME_PAYOUT: 'game_payout', // credit: mini-game win
  // ── engagement loops ──
  HOURLY_DROP: 'hourly_drop', // credit: claimed an hourly chip drop
  CHEST_REWARD: 'chest_reward', // credit: opened a variable-reward chest
  SPIN_REWARD: 'spin_reward', // credit: daily free spin reward
  // ── fixed-odds peer betting (matched offers) ──
  OFFER_ESCROW: 'offer_escrow', // debit: maker/taker locks their stake on a matched offer
  OFFER_REFUND: 'offer_refund', // credit: unmatched offer cancelled / match voided
  OFFER_PAYOUT: 'offer_payout', // credit: winner takes the matched pot
  // ── card-game home-session tracker ──
  SESSION_BUYIN: 'session_buyin', // debit: chips put on the table (Chips mode)
  SESSION_CASHOUT: 'session_cashout', // credit: chips taken off the table at settle
  SESSION_SETTLE: 'session_settle', // transfer leg when settling debts between players
} as const;
export type LedgerReason = (typeof LEDGER_REASON)[keyof typeof LEDGER_REASON];

/** Whether an entry adds to or subtracts from a balance. */
export const LEDGER_DIRECTION = { CREDIT: 'credit', DEBIT: 'debit' } as const;
export type LedgerDirection = (typeof LEDGER_DIRECTION)[keyof typeof LEDGER_DIRECTION];

/**
 * The fixed system account that all grants and rake flow through.
 * NOTE: must NOT be wrapped in double underscores — Firestore reserves any
 * document id matching `__.*__`, which would make every ledger write to the
 * house account fail with INVALID_ARGUMENT.
 */
export const HOUSE_UID = 'house_account' as const;

/** Windows. */
export const TIMING = {
  /** After a resolution is proposed, this long for participants to dispute. */
  DISPUTE_WINDOW_MS: 24 * 60 * 60 * 1000,
  /** A bet with no resolution by resolveBy is auto-voided and refunded. */
  AUTO_VOID_GRACE_MS: 0,
} as const;

/** Disclosure shown anywhere money-like value appears. */
export const NO_CASH_VALUE_DISCLOSURE =
  'Chips are for entertainment only and have no real-world cash value.';
