/**
 * Typed wrappers around callable Cloud Functions. The app NEVER computes money;
 * it calls these and reads back server-written state. Each wrapper validates its
 * payload with the shared zod schema before sending.
 *
 * In emulator/dev without deployed functions, callables will reject — the hooks
 * that use these surface a friendly error and the app remains usable for browsing.
 */

import { z } from 'zod';
import { httpsCallable } from 'firebase/functions';
import { functions } from './app';
import {
  CreateBetPayload,
  CreateBetPayloadSchema,
  PlaceBetPayload,
  PlaceBetPayloadSchema,
  ResolveBetPayloadSchema,
  SetRgLimitsPayloadSchema,
  VerifyAgePayloadSchema,
} from '@/shared/schemas';
import {
  ClaimMissionPayloadSchema,
  BuyCosmeticPayloadSchema,
  EquipCosmeticPayloadSchema,
  BuyPowerUpPayloadSchema,
  SubscribeProPayloadSchema,
  CreateParlayPayloadSchema,
  CreateSquaresPayloadSchema,
  ClaimSquarePayloadSchema,
  SendChatPayloadSchema,
  ChallengeFriendPayloadSchema,
} from '@/shared/schemas-ext';

function callable<TReq, TRes>(name: string) {
  const fn = httpsCallable<TReq, TRes>(functions, name);
  return async (data: TReq): Promise<TRes> => {
    const res = await fn(data);
    return res.data;
  };
}

export interface CallableResult {
  ok: boolean;
  [k: string]: unknown;
}

const _verifyAge = callable<unknown, CallableResult & { chipsGranted: number }>('verifyAge');
export async function verifyAge(input: { dateOfBirth: number; region?: string; referralCode?: string }) {
  const payload = VerifyAgePayloadSchema.parse(input);
  return _verifyAge(payload);
}

const _createBet = callable<CreateBetPayload, CallableResult & { betId: string; shareCode: string }>('createBet');
export async function createBet(input: CreateBetPayload) {
  const payload = CreateBetPayloadSchema.parse(input);
  return _createBet(payload);
}

const _placeBet = callable<PlaceBetPayload, CallableResult & { entryId: string; newBalance: number }>('placeBet');
export async function placeBet(input: PlaceBetPayload) {
  const payload = PlaceBetPayloadSchema.parse(input);
  return _placeBet(payload);
}

const _cancelEntry = callable<{ betId: string }, CallableResult & { refunded: number }>('cancelEntry');
export async function cancelEntry(betId: string) {
  return _cancelEntry({ betId });
}

const _resolveBet = callable<unknown, CallableResult>('resolveBet');
export async function resolveBet(input: { betId: string; winningOutcomeId: string; evidencePath?: string | null }) {
  const payload = ResolveBetPayloadSchema.parse(input);
  return _resolveBet(payload);
}

const _voteOutcome = callable<{ betId: string; outcomeId: string }, CallableResult>('voteOutcome');
export async function voteOutcome(betId: string, outcomeId: string) {
  return _voteOutcome({ betId, outcomeId });
}

const _raiseDispute = callable<{ betId: string; reason: string; evidencePath?: string | null }, CallableResult>('raiseDispute');
export async function raiseDispute(betId: string, reason: string, evidencePath?: string | null) {
  return _raiseDispute({ betId, reason, evidencePath: evidencePath ?? null });
}

const _grantDailyChips = callable<unknown, CallableResult & { granted: number; streak: number; nextClaimAt: number }>('grantDailyChips');
export async function grantDailyChips() {
  return _grantDailyChips({});
}

const _claimZeroRefill = callable<unknown, CallableResult & { granted: number }>('claimZeroRefill');
export async function claimZeroRefill() {
  return _claimZeroRefill({});
}

const _setRgLimits = callable<unknown, CallableResult>('setRgLimits');
export async function setRgLimits(input: {
  dailyStakeLimit?: number | null;
  weeklyStakeLimit?: number | null;
  dailyBetCountLimit?: number | null;
  sessionReminderMins?: number;
  selfExcludeForMs?: number | null;
}) {
  const payload = SetRgLimitsPayloadSchema.parse(input);
  return _setRgLimits(payload);
}

const _sendFriendRequest = callable<{ targetUid?: string; handle?: string }, CallableResult>('sendFriendRequest');
export async function sendFriendRequest(input: { targetUid?: string; handle?: string }) {
  return _sendFriendRequest(input);
}

const _respondFriendRequest = callable<{ fromUid: string; accept: boolean }, CallableResult>('respondFriendRequest');
export async function respondFriendRequest(fromUid: string, accept: boolean) {
  return _respondFriendRequest({ fromUid, accept });
}

const _createGroup = callable<{ name: string; emoji?: string; description?: string }, CallableResult & { groupId: string; inviteCode: string }>('createGroup');
export async function createGroup(input: { name: string; emoji?: string; description?: string }) {
  return _createGroup(input);
}

const _joinGroup = callable<{ inviteCode: string }, CallableResult & { groupId: string }>('joinGroup');
export async function joinGroup(inviteCode: string) {
  return _joinGroup({ inviteCode });
}

const _postComment = callable<{ betId: string; text: string; gifUrl?: string | null }, CallableResult & { commentId: string }>('postComment');
export async function postComment(betId: string, text: string, gifUrl?: string | null) {
  return _postComment({ betId, text, gifUrl: gifUrl ?? null });
}

const _registerDevice = callable<{ token: string; platform: string }, CallableResult>('registerDevice');
export async function registerDevice(token: string, platform: string) {
  return _registerDevice({ token, platform });
}

// ─── Expansion callables ─────────────────────────────────────────────────────
// Typed wrappers for every NEW callable across all expansion tracks. Each
// validates its payload with the shared zod schema (or an inline one where the
// payload has no shared schema) before calling the same-named callable. The
// Economy track owns this file; other tracks ASSUME these exist by name.

// Inline payload schemas for callables without a shared schema in schemas-ext.
const EnsureMissionsPayloadSchema = z.object({});
const GenerateWrappedPayloadSchema = z.object({ periodId: z.string().optional() });
const CreateBracketPayloadSchema = z.object({
  title: z.string().min(3).max(120),
  competitors: z.array(z.string().min(1)).min(2).max(64),
  entryFee: z.number().int().nonnegative(),
  groupId: z.string().nullable().optional(),
});
const AdvanceBracketPayloadSchema = z.object({
  bracketId: z.string(),
  matchId: z.string(),
  winnerName: z.string().min(1),
});
const CreateBetFromFixturePayloadSchema = z.object({
  fixtureId: z.string(),
  market: z.string().min(1).max(60),
  stake: z.number().int().nonnegative().optional(),
  lockAt: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string(),
});
const ApplyPowerUpPayloadSchema = z.object({
  betId: z.string(),
  key: z.enum(['insurance', 'double']),
});
const GiftIntoBetPayloadSchema = z.object({
  betId: z.string(),
  recipientUid: z.string(),
  amount: z.number().int().positive(),
});

// ── Gamification ──
const _claimMission = callable<unknown, CallableResult & { reward: number; xp: number }>('claimMission');
export async function claimMission(input: { missionId: string }) {
  const payload = ClaimMissionPayloadSchema.parse(input);
  return _claimMission(payload);
}

const _ensureMissions = callable<unknown, CallableResult & { created: number }>('ensureMissions');
export async function ensureMissions() {
  return _ensureMissions(EnsureMissionsPayloadSchema.parse({}));
}

const _generateWrapped = callable<unknown, CallableResult & { periodId: string }>('generateWrapped');
export async function generateWrapped(input: { periodId?: string } = {}) {
  const payload = GenerateWrappedPayloadSchema.parse(input);
  return _generateWrapped(payload);
}

// ── Game formats ──
const _createParlay = callable<unknown, CallableResult & { slipId: string }>('createParlay');
export async function createParlay(input: z.infer<typeof CreateParlayPayloadSchema>) {
  const payload = CreateParlayPayloadSchema.parse(input);
  return _createParlay(payload);
}

const _createSquaresGame = callable<unknown, CallableResult & { gameId: string }>('createSquaresGame');
export async function createSquaresGame(input: z.infer<typeof CreateSquaresPayloadSchema>) {
  const payload = CreateSquaresPayloadSchema.parse(input);
  return _createSquaresGame(payload);
}

const _claimSquare = callable<unknown, CallableResult & { cellIndex: number }>('claimSquare');
export async function claimSquare(input: { gameId: string; cellIndex: number }) {
  const payload = ClaimSquarePayloadSchema.parse(input);
  return _claimSquare(payload);
}

const _createBracket = callable<unknown, CallableResult & { bracketId: string }>('createBracket');
export async function createBracket(input: z.infer<typeof CreateBracketPayloadSchema>) {
  const payload = CreateBracketPayloadSchema.parse(input);
  return _createBracket(payload);
}

const _advanceBracket = callable<unknown, CallableResult>('advanceBracket');
export async function advanceBracket(input: { bracketId: string; matchId: string; winnerName: string }) {
  const payload = AdvanceBracketPayloadSchema.parse(input);
  return _advanceBracket(payload);
}

// ── Sports ──
const _createBetFromFixture = callable<unknown, CallableResult & { betId: string }>('createBetFromFixture');
export async function createBetFromFixture(input: z.infer<typeof CreateBetFromFixturePayloadSchema>) {
  const payload = CreateBetFromFixturePayloadSchema.parse(input);
  return _createBetFromFixture(payload);
}

// ── Social ──
const _challengeFriend = callable<unknown, CallableResult & { betId: string }>('challengeFriend');
export async function challengeFriend(input: z.infer<typeof ChallengeFriendPayloadSchema>) {
  const payload = ChallengeFriendPayloadSchema.parse(input);
  return _challengeFriend(payload);
}

const _sendChat = callable<unknown, CallableResult & { messageId: string }>('sendChat');
export async function sendChat(input: z.infer<typeof SendChatPayloadSchema>) {
  const payload = SendChatPayloadSchema.parse(input);
  return _sendChat(payload);
}

// ── Economy & cosmetics ──
const _buyCosmetic = callable<unknown, CallableResult & { itemId: string; cosmeticKey: string }>('buyCosmetic');
export async function buyCosmetic(input: { cosmeticKey: string }) {
  const payload = BuyCosmeticPayloadSchema.parse(input);
  return _buyCosmetic(payload);
}

const _equipCosmetic = callable<unknown, CallableResult & { type: string; cosmeticKey: string | null }>('equipCosmetic');
export async function equipCosmetic(input: z.infer<typeof EquipCosmeticPayloadSchema>) {
  const payload = EquipCosmeticPayloadSchema.parse(input);
  return _equipCosmetic(payload);
}

const _buyPowerUp = callable<unknown, CallableResult & { key: string; count: number }>('buyPowerUp');
export async function buyPowerUp(input: { key: string; count?: number }) {
  const payload = BuyPowerUpPayloadSchema.parse(input);
  return _buyPowerUp(payload);
}

const _subscribePro = callable<unknown, CallableResult & { active: boolean; since: number; expiresAt: number }>('subscribePro');
export async function subscribePro() {
  return _subscribePro(SubscribeProPayloadSchema.parse({}));
}

const _applyPowerUp = callable<unknown, CallableResult & { betId: string; key: string }>('applyPowerUp');
export async function applyPowerUp(input: { betId: string; key: 'insurance' | 'double' }) {
  const payload = ApplyPowerUpPayloadSchema.parse(input);
  return _applyPowerUp(payload);
}

const _giftIntoBet = callable<unknown, CallableResult & { betId: string; recipientUid: string; amount: number }>('giftIntoBet');
export async function giftIntoBet(input: { betId: string; recipientUid: string; amount: number }) {
  const payload = GiftIntoBetPayloadSchema.parse(input);
  return _giftIntoBet(payload);
}
