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

// ── Social depth & virality (expansion) ─────────────────────────────────────
export { sendChat } from './callables/sendChat';
export { claimReferral } from './callables/claimReferral';

// ── Economy & cosmetics (expansion) ──────────────────────────────────────────
export {
  buyCosmetic,
  equipCosmetic,
  buyPowerUp,
  subscribePro,
  applyPowerUp,
  giftIntoBet,
} from './callables/economy';

// ── Gamification (expansion) ──────────────────────────────────────────────────
export { ensureMissions, claimMission } from './callables/missions';
export { generateWrapped } from './callables/generateWrapped';

// ── Live sports oracle (expansion) ───────────────────────────────────────────
export { createBetFromFixture } from './callables/createBetFromFixture';

// ── Bet formats: parlays / squares / brackets / challenge (Formats track) ─────
export { createParlay } from './callables/createParlay';
export { createSquaresGame } from './callables/createSquares';
export { claimSquare } from './callables/claimSquare';
export { createBracket, advanceBracket } from './callables/bracket';
export { challengeFriend } from './callables/challengeFriend';
export { settleSquares } from './settlement/settleSquares';

// ── Casino mini-games (Casino track) ─────────────────────────────────────────
export { playGame } from './callables/playGame';

// ── Settlement engine (admin/system callable) ───────────────────────────────
export { settleBet } from './settlement/settle';

// ── Triggers ─────────────────────────────────────────────────────────────────
export { onUserCreate } from './triggers/onUserCreate';
export { tallyVotes } from './triggers/tallyVotes';
export { onBetSettled } from './triggers/onBetSettled';
export { onBetCreate } from './triggers/onBetCreate';
export { onFriendRequest } from './triggers/onFriendRequest';
export { onSettlementRivalry } from './triggers/onSettlementRivalry';
export { onBetSettledPowerUps } from './triggers/onBetSettledPowerUps';
export { awardProgress } from './triggers/awardProgress';

// ── Scheduled sweeps ─────────────────────────────────────────────────────────
export { lockBetsSweep } from './scheduled/lockBetsSweep';
export { autoVoidSweep } from './scheduled/autoVoidSweep';
export { settleAfterDisputeWindow } from './scheduled/settleAfterDisputeWindow';
export { reconcileBalances } from './scheduled/reconcileBalances';
export { expirePro } from './scheduled/expirePro';

// ── Live sports oracle sweeps (expansion) ─────────────────────────────────────
export { syncFixtures } from './scheduled/syncFixtures';
export { updateLiveScores } from './scheduled/updateLiveScores';
export { oracleResolve } from './scheduled/oracleResolve';

// ── Gamification sweeps (expansion) ───────────────────────────────────────────
export { rollSeason, refreshSeasonStandings } from './scheduled/rollSeason';
export { rotateDailyMissions, rotateWeeklyMissions } from './scheduled/rotateMissions';

// ── Bet formats sweeps (Formats track) ────────────────────────────────────────
export { settleParlaysSweep } from './scheduled/settleParlaysSweep';

// ── Hyper-engagement loops (Engagement track) ─────────────────────────────────
export { claimHourlyDrop } from './callables/claimHourlyDrop';
export { openChest } from './callables/openChest';
export { dailySpin } from './callables/dailySpin';
export { recordActivity } from './callables/recordActivity';

// ── Prediction markets (Markets track) ────────────────────────────────────────
export { createMarket } from './callables/createMarket';
export { tradeMarket } from './callables/tradeMarket';
export { resolveMarket } from './callables/resolveMarket';
export { closeMarketsSweep, autoVoidMarketsSweep } from './scheduled/marketSweeps';

// ── Discovery feed (Discovery track) ──────────────────────────────────────────
export { buildDiscovery } from './scheduled/buildDiscovery';

// ── Fixed-odds peer betting ("I'll lay you 2:1") — Fixed-odds track ───────────
export { createOffer } from './callables/createOffer';
export { takeOffer } from './callables/takeOffer';
export { cancelOffer } from './callables/cancelOffer';
export { settleFixedOddsMatches } from './triggers/settleFixedOddsMatches';

// ── Card-game home-session tracker (Card track) ───────────────────────────────
export { createSession } from './callables/createSession';
export { joinSession } from './callables/joinSession';
export { sessionBuyIn } from './callables/sessionBuyIn';
export { sessionCashout } from './callables/sessionCashout';
export { settleSession } from './callables/settleSession';
