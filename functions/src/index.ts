/**
 * Cloud Functions entrypoint. Every function is gen2 in region asia-east2
 * (except onUserCreate, a v1 Auth background trigger pinned to the same region).
 *
 * The client calls the callables via @/lib/firebase/functions (`fns.*`); the
 * triggers and scheduled sweeps run server-side to keep money + status
 * server-authoritative. The settlement engine is the integrity core: atomic,
 * idempotent, server-only.
 */

// ── Callables ──────────────────────────────────────────────────────────────
export { verifyAge } from './callables/verifyAge';
export { createBet } from './callables/createBet';
export { placeBet } from './callables/placeBet';
export { cancelEntry } from './callables/cancelEntry';
export { resolveBet } from './callables/resolveBet';
export { voteOutcome } from './callables/voteOutcome';
export { raiseDispute } from './callables/raiseDispute';
export { grantDailyChips } from './callables/grantDailyChips';
export { claimZeroRefill } from './callables/claimZeroRefill';
export { setRgLimits } from './callables/setRgLimits';
export { sendFriendRequest, respondFriendRequest } from './callables/friends';
export { createGroup, joinGroup } from './callables/groups';
export { postComment } from './callables/postComment';
export { registerDevice } from './callables/registerDevice';

// ── Settlement engine (admin/system callable) ───────────────────────────────
export { settleBet } from './settlement/settle';

// ── Triggers ─────────────────────────────────────────────────────────────────
export { onUserCreate } from './triggers/onUserCreate';
export { tallyVotes } from './triggers/tallyVotes';
export { onBetSettled } from './triggers/onBetSettled';
export { onBetCreate } from './triggers/onBetCreate';
export { onFriendRequest } from './triggers/onFriendRequest';

// ── Scheduled sweeps ─────────────────────────────────────────────────────────
export { lockBetsSweep } from './scheduled/lockBetsSweep';
export { autoVoidSweep } from './scheduled/autoVoidSweep';
export { settleAfterDisputeWindow } from './scheduled/settleAfterDisputeWindow';
export { reconcileBalances } from './scheduled/reconcileBalances';
