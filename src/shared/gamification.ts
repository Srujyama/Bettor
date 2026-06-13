/**
 * Gamification + expansion constants and PURE logic. No Firebase, no React.
 * Shared by the app (display/preview) and Cloud Functions (authoritative grants).
 *
 * Covers: XP/level curve, login & win streaks, the achievements catalog, the
 * mission/quest templates, season config, cosmetics/shop catalog, power-ups,
 * and Pro tier. Anything that awards Chips runs server-side via the ledger.
 */

// ─── XP & Levels ───────────────────────────────────────────────────────────────

/** XP awarded for core actions. Tuned so casual play levels steadily. */
export const XP = {
  PLACE_BET: 10,
  CREATE_BET: 20,
  WIN_BET: 40,
  RESOLVE_BET: 15,
  INVITE_ACCEPTED: 50,
  DAILY_LOGIN: 5,
  COMMENT: 2,
  MISSION_COMPLETE: 30,
} as const;

/**
 * Total XP required to be AT a given level (1-indexed). Smooth quadratic-ish
 * curve: level N needs ~ 50 * (N-1)^1.6 cumulative XP. Pure + deterministic.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 1.6));
}

/** Resolve a total XP value into {level, intoLevel, span, progress}. */
export function levelFromXp(totalXp: number): {
  level: number;
  intoLevel: number; // xp earned past the current level threshold
  span: number; // xp needed to reach the next level
  progress: number; // 0..1 toward next level
  nextLevelXp: number; // cumulative xp for the next level
} {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp && level < 999) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - base);
  const intoLevel = totalXp - base;
  return { level, intoLevel, span, progress: Math.min(1, intoLevel / span), nextLevelXp: next };
}

/** Chips awarded for reaching a level (every level pays a little; multiples of 5 pay more). */
export function levelUpReward(level: number): number {
  if (level % 25 === 0) return 5_000;
  if (level % 10 === 0) return 1_500;
  if (level % 5 === 0) return 500;
  return 100;
}

// ─── Streaks ─────────────────────────────────────────────────────────────────

/** Login-streak milestones → bonus Chips. */
export const STREAK_MILESTONES: Record<number, number> = {
  3: 150,
  7: 500,
  14: 1_200,
  30: 3_000,
  60: 7_000,
  100: 15_000,
};

export function streakMilestoneReward(streak: number): number {
  return STREAK_MILESTONES[streak] ?? 0;
}

// ─── Achievements catalog ──────────────────────────────────────────────────────

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  icon: string; // emoji
  tier: AchievementTier;
  /** Chip reward on unlock. */
  reward: number;
  /** Stat field on the user/aggregate this is measured against + threshold. */
  metric:
    | 'winCount'
    | 'betsCreated'
    | 'betsPlaced'
    | 'currentStreak'
    | 'dailyStreak'
    | 'friendCount'
    | 'biggestWin'
    | 'level'
    | 'commentsPosted'
    | 'crewsJoined'
    | 'perfectParlay'
    | 'comebackWin';
  threshold: number;
  /** Hidden until unlocked (surprise achievements). */
  secret?: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_blood', title: 'First Blood', description: 'Win your first bet', icon: '🩸', tier: 'bronze', reward: 100, metric: 'winCount', threshold: 1 },
  { key: 'on_a_roll', title: 'On a Roll', description: 'Win 10 bets', icon: '🎯', tier: 'silver', reward: 500, metric: 'winCount', threshold: 10 },
  { key: 'sharp', title: 'The Sharp', description: 'Win 50 bets', icon: '🦈', tier: 'gold', reward: 2_500, metric: 'winCount', threshold: 50 },
  { key: 'legend', title: 'Living Legend', description: 'Win 250 bets', icon: '👑', tier: 'platinum', reward: 10_000, metric: 'winCount', threshold: 250 },
  { key: 'bookie', title: 'The Bookie', description: 'Create 10 bets', icon: '📋', tier: 'silver', reward: 400, metric: 'betsCreated', threshold: 10 },
  { key: 'host_with_most', title: 'Host With The Most', description: 'Create 50 bets', icon: '🎙️', tier: 'gold', reward: 2_000, metric: 'betsCreated', threshold: 50 },
  { key: 'getting_started', title: 'Getting Started', description: 'Place 5 bets', icon: '🎲', tier: 'bronze', reward: 100, metric: 'betsPlaced', threshold: 5 },
  { key: 'degenerate', title: 'Action Junkie', description: 'Place 100 bets', icon: '🔥', tier: 'gold', reward: 2_000, metric: 'betsPlaced', threshold: 100 },
  { key: 'hot_streak', title: 'Hot Streak', description: 'Win 5 in a row', icon: '🌡️', tier: 'gold', reward: 1_500, metric: 'currentStreak', threshold: 5 },
  { key: 'unstoppable', title: 'Unstoppable', description: 'Win 10 in a row', icon: '⚡', tier: 'platinum', reward: 5_000, metric: 'currentStreak', threshold: 10 },
  { key: 'regular', title: 'Regular', description: '7-day login streak', icon: '📅', tier: 'silver', reward: 500, metric: 'dailyStreak', threshold: 7 },
  { key: 'devoted', title: 'Devoted', description: '30-day login streak', icon: '🗓️', tier: 'gold', reward: 3_000, metric: 'dailyStreak', threshold: 30 },
  { key: 'social', title: 'Social Butterfly', description: 'Add 5 friends', icon: '🦋', tier: 'bronze', reward: 200, metric: 'friendCount', threshold: 5 },
  { key: 'connector', title: 'The Connector', description: 'Add 25 friends', icon: '🕸️', tier: 'gold', reward: 1_500, metric: 'friendCount', threshold: 25 },
  { key: 'big_winner', title: 'Big Winner', description: 'Win 5,000 Chips on one bet', icon: '💰', tier: 'gold', reward: 1_000, metric: 'biggestWin', threshold: 5_000 },
  { key: 'whale', title: 'Whale', description: 'Win 50,000 Chips on one bet', icon: '🐋', tier: 'platinum', reward: 5_000, metric: 'biggestWin', threshold: 50_000 },
  { key: 'leveled', title: 'Climbing', description: 'Reach level 10', icon: '🪜', tier: 'silver', reward: 750, metric: 'level', threshold: 10 },
  { key: 'high_roller', title: 'High Roller', description: 'Reach level 50', icon: '🎰', tier: 'platinum', reward: 5_000, metric: 'level', threshold: 50 },
  { key: 'mouthy', title: 'Trash Talker', description: 'Post 50 comments', icon: '🗣️', tier: 'bronze', reward: 200, metric: 'commentsPosted', threshold: 50 },
  { key: 'crew_member', title: 'Crew Member', description: 'Join 3 crews', icon: '👥', tier: 'bronze', reward: 200, metric: 'crewsJoined', threshold: 3 },
  { key: 'parlay_king', title: 'Parlay King', description: 'Hit a 4+ leg parlay', icon: '🃏', tier: 'platinum', reward: 4_000, metric: 'perfectParlay', threshold: 1, secret: true },
  { key: 'comeback', title: 'The Comeback', description: 'Win after dropping below 100 Chips', icon: '🔄', tier: 'gold', reward: 1_000, metric: 'comebackWin', threshold: 1, secret: true },
];

export const ACHIEVEMENT_BY_KEY: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.key, a]),
);

/** Pure check: given a stats snapshot, which achievement keys are now satisfied. */
export function satisfiedAchievements(stats: Partial<Record<AchievementDef['metric'], number>>): string[] {
  return ACHIEVEMENTS.filter((a) => (stats[a.metric] ?? 0) >= a.threshold).map((a) => a.key);
}

// ─── Missions / Quests ───────────────────────────────────────────────────────

export type MissionPeriod = 'daily' | 'weekly';
export type MissionMetric =
  | 'place_bets'
  | 'create_bet'
  | 'win_bets'
  | 'comment'
  | 'invite_friend'
  | 'join_crew_bet'
  | 'resolve_bet'
  | 'login';

export interface MissionDef {
  key: string;
  title: string;
  description: string;
  icon: string;
  period: MissionPeriod;
  metric: MissionMetric;
  target: number;
  reward: number; // Chips
  xp: number;
}

/** Pool of dailies/weeklies; a scheduled function picks the active rotation. */
export const MISSION_POOL: MissionDef[] = [
  { key: 'd_place3', title: 'Get in the Game', description: 'Place 3 bets today', icon: '🎲', period: 'daily', metric: 'place_bets', target: 3, reward: 150, xp: 30 },
  { key: 'd_create1', title: 'Start Something', description: 'Create a bet today', icon: '✨', period: 'daily', metric: 'create_bet', target: 1, reward: 100, xp: 20 },
  { key: 'd_win1', title: 'Take One Down', description: 'Win a bet today', icon: '🏆', period: 'daily', metric: 'win_bets', target: 1, reward: 200, xp: 40 },
  { key: 'd_talk3', title: 'Stir the Pot', description: 'Post 3 comments today', icon: '🗯️', period: 'daily', metric: 'comment', target: 3, reward: 80, xp: 15 },
  { key: 'd_login', title: 'Show Up', description: 'Open Chipd today', icon: '👋', period: 'daily', metric: 'login', target: 1, reward: 50, xp: 5 },
  { key: 'w_place15', title: 'Weekly Grinder', description: 'Place 15 bets this week', icon: '⚙️', period: 'weekly', metric: 'place_bets', target: 15, reward: 800, xp: 120 },
  { key: 'w_win5', title: 'Weekly Winner', description: 'Win 5 bets this week', icon: '🥇', period: 'weekly', metric: 'win_bets', target: 5, reward: 1_200, xp: 150 },
  { key: 'w_invite', title: 'Bring a Friend', description: 'Get a friend to join a bet', icon: '🤝', period: 'weekly', metric: 'invite_friend', target: 1, reward: 600, xp: 80 },
  { key: 'w_crew', title: 'Crew Loyal', description: 'Join 5 crew bets this week', icon: '👥', period: 'weekly', metric: 'join_crew_bet', target: 5, reward: 700, xp: 100 },
];

export const MISSION_BY_KEY: Record<string, MissionDef> = Object.fromEntries(
  MISSION_POOL.map((m) => [m.key, m]),
);

// ─── Seasons ─────────────────────────────────────────────────────────────────

export const SEASON = {
  /** Length of a competitive season. */
  LENGTH_DAYS: 30,
  /** Placement rewards (1-indexed rank → Chips) for the friends/global board. */
  REWARDS: [10_000, 6_000, 4_000, 2_500, 2_000, 1_500, 1_500, 1_000, 1_000, 1_000] as number[],
  /** Everyone who played gets a participation reward. */
  PARTICIPATION_REWARD: 250,
} as const;

export function seasonRankReward(rank: number): number {
  return SEASON.REWARDS[rank - 1] ?? (rank <= 50 ? 500 : SEASON.PARTICIPATION_REWARD);
}

// ─── Cosmetics / Shop (compliance: cosmetic ONLY, bought with Chips, no cash) ───

export type CosmeticType = 'card_skin' | 'avatar_frame' | 'sticker_pack' | 'name_color' | 'win_effect';

export interface CosmeticDef {
  key: string;
  type: CosmeticType;
  name: string;
  description: string;
  icon: string;
  price: number; // Chips
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** Render hint the UI uses (gradient name, color hex, effect id). */
  value: string;
  /** Requires Pro to purchase/equip. */
  proOnly?: boolean;
}

export const SHOP_CATALOG: CosmeticDef[] = [
  { key: 'skin_jade', type: 'card_skin', name: 'Jade Felt', description: 'Classic high-roller green', icon: '🟢', price: 1_000, rarity: 'common', value: 'jade' },
  { key: 'skin_midnight', type: 'card_skin', name: 'Midnight', description: 'Deep ink with a subtle sheen', icon: '🌑', price: 1_500, rarity: 'rare', value: 'midnight' },
  { key: 'skin_gold', type: 'card_skin', name: 'Gold Leaf', description: 'For the genuinely insufferable winner', icon: '🟡', price: 5_000, rarity: 'epic', value: 'gold' },
  { key: 'skin_holo', type: 'card_skin', name: 'Holographic', description: 'Shifting foil, catches the light', icon: '🌈', price: 12_000, rarity: 'legendary', value: 'holo', proOnly: true },
  { key: 'frame_bronze', type: 'avatar_frame', name: 'Bronze Ring', description: 'A modest flex', icon: '🥉', price: 800, rarity: 'common', value: '#CD7F32' },
  { key: 'frame_neon', type: 'avatar_frame', name: 'Neon Halo', description: 'Glowing jade ring', icon: '💚', price: 2_500, rarity: 'rare', value: 'neon-jade' },
  { key: 'frame_crown', type: 'avatar_frame', name: 'Crown', description: 'Wear it well', icon: '👑', price: 8_000, rarity: 'legendary', value: 'crown' },
  { key: 'pack_classic', type: 'sticker_pack', name: 'Classic Taunts', description: '12 trash-talk stickers', icon: '😏', price: 600, rarity: 'common', value: 'classic' },
  { key: 'pack_macau', type: 'sticker_pack', name: 'Macau Nights', description: 'Local flavour sticker pack', icon: '🎆', price: 1_200, rarity: 'rare', value: 'macau' },
  { key: 'color_jade', type: 'name_color', name: 'Jade Name', description: 'Your name in jade', icon: '🟩', price: 1_000, rarity: 'common', value: '#00E0A4' },
  { key: 'color_gold', type: 'name_color', name: 'Gold Name', description: 'Your name in gold', icon: '🟨', price: 3_000, rarity: 'epic', value: '#F5C451' },
  { key: 'fx_confetti', type: 'win_effect', name: 'Extra Confetti', description: 'Bigger win celebration', icon: '🎉', price: 2_000, rarity: 'rare', value: 'confetti_plus' },
  { key: 'fx_fireworks', type: 'win_effect', name: 'Fireworks', description: 'Light up your wins', icon: '🎇', price: 6_000, rarity: 'epic', value: 'fireworks' },
];

export const COSMETIC_BY_KEY: Record<string, CosmeticDef> = Object.fromEntries(
  SHOP_CATALOG.map((c) => [c.key, c]),
);

// ─── Power-ups (cosmetic-adjacent gameplay; affect only Chip pilot economy) ─────

export interface PowerUpDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  price: number; // Chips to acquire
  /** When the power-up can be applied. */
  appliesAt: 'place' | 'pre_settle';
}

export const POWERUPS: PowerUpDef[] = [
  { key: 'insurance', name: 'Insurance', description: 'Refund half your stake if you lose this bet', icon: '🛡️', price: 250, appliesAt: 'place' },
  { key: 'double', name: 'Double or Nothing', description: 'Double your potential payout — but lose your whole stake if you’re wrong', icon: '✖️', price: 400, appliesAt: 'place' },
  { key: 'peek', name: 'Crystal Ball', description: 'See the live pool split before you commit', icon: '🔮', price: 100, appliesAt: 'place' },
];

export const POWERUP_BY_KEY: Record<string, PowerUpDef> = Object.fromEntries(
  POWERUPS.map((p) => [p.key, p]),
);

// ─── Pro tier (cosmetic / convenience; never pay-to-win on outcomes) ────────────

export const PRO = {
  /** Cost in Chips for a 30-day Pro period (pilot has no real-money IAP). */
  PRICE_CHIPS: 10_000,
  PERIOD_DAYS: 30,
  PERKS: [
    'Exclusive card skins & frames',
    'Bigger daily Chip drop (2×)',
    'Advanced stats & head-to-head insights',
    'Custom crew branding',
    'A Pro badge on your profile',
    'Higher self-set stake limits',
  ],
  DAILY_MULTIPLIER: 2,
} as const;
