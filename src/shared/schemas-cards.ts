/**
 * Schemas for fixed-odds peer offers and the card-game home-session tracker.
 * Separate file; re-exported via the shared barrel. Timestamps are epoch millis.
 * Money/escrow/settlement fields are CF-written only.
 */
import { z } from 'zod';

const epochMillis = z.number().int().nonnegative();
const chips = z.number().int().nonnegative();

// ─── Fixed-odds peer offers ("I'll lay you 2:1") ───────────────────────────────
// An offer lives under a bet: bets/{betId}/offers/{offerId}. The maker backs one
// outcome at decimal odds; takers lay the other side and get matched (partial OK).

export const FixedOddsOfferSchema = z.object({
  offerId: z.string(),
  betId: z.string(),
  makerUid: z.string(),
  makerName: z.string().optional(),
  makerPhotoURL: z.string().nullable().optional(),
  /** Outcome the maker is backing. */
  outcomeId: z.string(),
  /** Decimal odds (e.g. 2.0 even, 3.0 = 2:1). */
  odds: z.number().positive(),
  /** Total chips the maker put up (their risk on the backed side). */
  backerStake: chips,
  /** Maker stake still unmatched (decreases as takers fill). */
  remainingStake: chips,
  status: z.enum(['open', 'partial', 'filled', 'cancelled', 'settled']).default('open'),
  createdAt: epochMillis,
});
export type FixedOddsOffer = z.infer<typeof FixedOddsOfferSchema>;

/** One matched pair (a fill): bets/{betId}/matches/{matchId}. */
export const FixedOddsMatchSchema = z.object({
  matchId: z.string(),
  betId: z.string(),
  offerId: z.string(),
  makerUid: z.string(), // backs `backedOutcomeId`
  takerUid: z.string(), // lays the other side
  backedOutcomeId: z.string(),
  odds: z.number().positive(),
  backerStake: chips, // maker's matched stake
  layerRisk: chips, // taker's escrow
  pot: chips, // backerStake + layerRisk → winner takes it
  status: z.enum(['matched', 'settled', 'void']).default('matched'),
  winner: z.enum(['backer', 'layer']).nullable().optional(),
  createdAt: epochMillis,
  settledAt: epochMillis.nullable().optional(),
});
export type FixedOddsMatch = z.infer<typeof FixedOddsMatchSchema>;

// ─── Card-game home sessions ─────────────────────────────────────────────────

export const CARD_GAME = {
  POKER_CASH: 'poker_cash',
  POKER_TOURNAMENT: 'poker_tournament',
  BLACKJACK: 'blackjack',
  GENERIC: 'generic',
} as const;
export type CardGameType = (typeof CARD_GAME)[keyof typeof CARD_GAME];

export const SessionPlayerSchema = z.object({
  uid: z.string(),
  displayName: z.string(),
  photoURL: z.string().nullable().optional(),
  /** Total bought in (sum of buy-ins + rebuys). CF-maintained. */
  buyIn: chips.default(0),
  /** Final cash-out / stack. Null until recorded. */
  cashOut: chips.nullable().optional(),
  /** Tournament finishing place (1 = winner), null for cash games. */
  place: z.number().int().positive().nullable().optional(),
  /** Net = cashOut - buyIn, computed at settle. */
  net: z.number().int().nullable().optional(),
  joinedAt: epochMillis,
});
export type SessionPlayer = z.infer<typeof SessionPlayerSchema>;

export const SessionTxnSchema = z.object({
  txnId: z.string(),
  uid: z.string(),
  kind: z.enum(['buy_in', 'rebuy', 'cash_out']),
  amount: chips,
  byUid: z.string(), // who recorded it (host or self)
  createdAt: epochMillis,
});
export type SessionTxn = z.infer<typeof SessionTxnSchema>;

export const CardSessionSchema = z.object({
  sessionId: z.string(),
  hostUid: z.string(),
  hostName: z.string().optional(),
  title: z.string().min(1).max(80),
  gameType: z.enum(['poker_cash', 'poker_tournament', 'blackjack', 'generic']),
  /** 'chips' = buy-ins/payouts move Chips via the ledger. 'tracking' = record only. */
  mode: z.enum(['chips', 'tracking']).default('chips'),
  /** Suggested buy-in (default amount when a player buys in). */
  defaultBuyIn: chips.default(0),
  status: z.enum(['open', 'settling', 'settled', 'cancelled']).default('open'),
  playerCount: z.number().int().nonnegative().default(0),
  pot: chips.default(0), // total on the table (sum of buy-ins)
  createdAt: epochMillis,
  settledAt: epochMillis.nullable().optional(),
  /** Settle-up transfers computed at settle (who pays whom). */
  transfers: z
    .array(z.object({ from: z.string(), to: z.string(), amount: chips }))
    .default([]),
});
export type CardSession = z.infer<typeof CardSessionSchema>;

// ─── Cloud Function payloads ───────────────────────────────────────────────────

export const CreateOfferPayloadSchema = z.object({
  betId: z.string(),
  outcomeId: z.string(),
  odds: z.number().positive(),
  backerStake: chips,
  idempotencyKey: z.string(),
});
export type CreateOfferPayload = z.infer<typeof CreateOfferPayloadSchema>;

export const TakeOfferPayloadSchema = z.object({
  betId: z.string(),
  offerId: z.string(),
  /** Chips the taker is willing to lay (their escrow budget). Partial fills allowed. */
  budget: chips,
  idempotencyKey: z.string(),
});
export type TakeOfferPayload = z.infer<typeof TakeOfferPayloadSchema>;

export const CancelOfferPayloadSchema = z.object({ betId: z.string(), offerId: z.string() });

export const CreateSessionPayloadSchema = z.object({
  title: z.string().min(1).max(80),
  gameType: z.enum(['poker_cash', 'poker_tournament', 'blackjack', 'generic']),
  mode: z.enum(['chips', 'tracking']).default('chips'),
  defaultBuyIn: chips.optional(),
  idempotencyKey: z.string(),
});
export type CreateSessionPayload = z.infer<typeof CreateSessionPayloadSchema>;

export const JoinSessionPayloadSchema = z.object({
  sessionId: z.string(),
  /** Add a guest who isn't a Chipd user (tracking mode). */
  guestName: z.string().max(40).optional(),
});

export const SessionBuyInPayloadSchema = z.object({
  sessionId: z.string(),
  uid: z.string(), // the player buying in (host can record for others)
  amount: chips,
  kind: z.enum(['buy_in', 'rebuy']).default('buy_in'),
});

export const SessionCashoutPayloadSchema = z.object({
  sessionId: z.string(),
  uid: z.string(),
  amount: chips, // final stack
  place: z.number().int().positive().optional(), // tournaments
});

export const SettleSessionPayloadSchema = z.object({ sessionId: z.string() });
