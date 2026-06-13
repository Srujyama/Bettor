/**
 * Typed wrappers around callable Cloud Functions. The app NEVER computes money;
 * it calls these and reads back server-written state. Each wrapper validates its
 * payload with the shared zod schema before sending.
 *
 * In emulator/dev without deployed functions, callables will reject — the hooks
 * that use these surface a friendly error and the app remains usable for browsing.
 */

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
