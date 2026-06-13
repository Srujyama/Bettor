/**
 * Domain data hooks. Screens import ONLY from here for reads — they never touch
 * Firestore directly. Every hook returns a live (onSnapshot-backed) query.
 */
import { orderBy, limit as fbLimit, where } from 'firebase/firestore';
import { useSession } from '@/stores/session';
import { paths, rivalryPairId } from '@/lib/firebase/paths';
import { useCollectionQuery, useDocQuery } from './useFirestoreQuery';
import type {
  AppNotification,
  Bet,
  BetEntry,
  Comment,
  FeedItem,
  Friend,
  Group,
  LedgerEntry,
  Settlement,
  User,
  Vote,
} from '@/shared/schemas';
import type {
  Bracket,
  ChatMessage,
  Fixture,
  InventoryItem,
  ParlaySlip,
  Rivalry,
  Season,
  SeasonStanding,
  SquaresGame,
  UserAchievement,
  UserMission,
  Wrapped,
} from '@/shared/schemas-ext';

export function useCurrentUser() {
  const uid = useSession((s) => s.uid);
  return useDocQuery<User>(['user', uid], uid ? paths.user(uid) : null, !!uid);
}

export function useUser(uid: string | null) {
  return useDocQuery<User>(['user', uid], uid ? paths.user(uid) : null, !!uid);
}

/** Wallet = the denormalized balance fields on the user doc, volatile key. */
export function useWallet() {
  const uid = useSession((s) => s.uid);
  return useDocQuery<User>(['wallet', uid], uid ? paths.user(uid) : null, !!uid);
}

export function useLedger(max = 50) {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<LedgerEntry>(
    ['ledger', uid, max],
    uid ? paths.ledger(uid) : null,
    [orderBy('seq', 'desc'), fbLimit(max)],
    !!uid,
  );
}

export function useBet(betId: string | null) {
  return useDocQuery<Bet>(['bet', betId], betId ? paths.bet(betId) : null, !!betId);
}

export function useBetEntries(betId: string | null) {
  return useCollectionQuery<BetEntry>(
    ['bet', betId, 'entries'],
    betId ? paths.entries(betId) : null,
    [orderBy('joinedAt', 'asc')],
    !!betId,
  );
}

export function useBetVotes(betId: string | null) {
  return useCollectionQuery<Vote>(
    ['bet', betId, 'votes'],
    betId ? paths.votes(betId) : null,
    [],
    !!betId,
  );
}

export function useBetComments(betId: string | null) {
  return useCollectionQuery<Comment>(
    ['bet', betId, 'comments'],
    betId ? paths.comments(betId) : null,
    [orderBy('createdAt', 'asc'), fbLimit(200)],
    !!betId,
  );
}

export function useSettlement(betId: string | null) {
  return useDocQuery<Settlement>(
    ['settlement', betId],
    betId ? paths.settlement(betId) : null,
    !!betId,
  );
}

/** Discover feed — open public bets, newest first. */
export function useDiscoverBets(max = 30) {
  return useCollectionQuery<Bet>(
    ['bets', 'discover', max],
    paths.bets(),
    [where('status', '==', 'open'), orderBy('createdAt', 'desc'), fbLimit(max)],
    true,
  );
}

/** Bets the user created or could join, scoped to a group. */
export function useGroupBets(groupId: string | null, max = 30) {
  return useCollectionQuery<Bet>(
    ['bets', 'group', groupId, max],
    groupId ? paths.bets() : null,
    [where('groupId', '==', groupId), orderBy('createdAt', 'desc'), fbLimit(max)],
    !!groupId,
  );
}

/** Bets created by a given user. */
export function useUserBets(uid: string | null, max = 30) {
  return useCollectionQuery<Bet>(
    ['bets', 'byUser', uid, max],
    uid ? paths.bets() : null,
    [where('creatorUid', '==', uid), orderBy('createdAt', 'desc'), fbLimit(max)],
    !!uid,
  );
}

export function useFeed(max = 50) {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<FeedItem>(
    ['feed', uid, max],
    uid ? paths.feed(uid) : null,
    [orderBy('createdAt', 'desc'), fbLimit(max)],
    !!uid,
  );
}

export function useNotifications(max = 50) {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<AppNotification>(
    ['notifications', uid, max],
    uid ? paths.notifications(uid) : null,
    [orderBy('createdAt', 'desc'), fbLimit(max)],
    !!uid,
  );
}

export function useFriends() {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<Friend>(
    ['friends', uid],
    uid ? paths.friends(uid) : null,
    [orderBy('createdAt', 'desc')],
    !!uid,
  );
}

export function useGroups() {
  const uid = useSession((s) => s.uid);
  // Groups the user belongs to, found via a denormalized memberOf array on the user
  // would be ideal; for the pilot we query groups where the user is a member via
  // a collection-group query handled in the groups feature. Here we list owned/joined.
  return useCollectionQuery<Group>(
    ['groups', uid],
    paths.groups(),
    [orderBy('createdAt', 'desc'), fbLimit(50)],
    !!uid,
  );
}

export function useGroup(groupId: string | null) {
  return useDocQuery<Group>(['group', groupId], groupId ? paths.group(groupId) : null, !!groupId);
}

// ─── Expansion read hooks ──────────────────────────────────────────────────────
// All live (onSnapshot-backed) reads for the gamification, economy, formats,
// sports, and social-depth tracks. Money/inventory are CF-written; these only
// read. Owned by the Social track per the expansion coordination rules.

/** A user's unlocked achievements (own by default, any uid for public profiles). */
export function useAchievements(uid?: string | null) {
  const myUid = useSession((s) => s.uid);
  const target = uid ?? myUid ?? null;
  return useCollectionQuery<UserAchievement>(
    ['achievements', target],
    target ? paths.achievements(target) : null,
    [orderBy('unlockedAt', 'desc')],
    !!target,
  );
}

/** The current user's active daily/weekly missions. */
export function useMissions() {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<UserMission>(
    ['missions', uid],
    uid ? paths.missions(uid) : null,
    [orderBy('expiresAt', 'asc')],
    !!uid,
  );
}

/** The current user's owned cosmetics inventory. */
export function useInventory() {
  const uid = useSession((s) => s.uid);
  return useCollectionQuery<InventoryItem>(
    ['inventory', uid],
    uid ? paths.inventory(uid) : null,
    [orderBy('acquiredAt', 'desc')],
    !!uid,
  );
}

/** The single active competitive season (newest first; first row is current). */
export function useSeason() {
  return useCollectionQuery<Season>(
    ['seasons', 'active'],
    paths.seasons(),
    [where('active', '==', true), fbLimit(1)],
    true,
  );
}

/** Standings for a season (defaults to a leaderboard-sized slice). */
export function useSeasonStandings(seasonId: string | null, max = 50) {
  return useCollectionQuery<SeasonStanding>(
    ['season', seasonId, 'standings', max],
    seasonId ? paths.seasonStandings(seasonId) : null,
    [orderBy('rank', 'asc'), fbLimit(max)],
    !!seasonId,
  );
}

/** The current user's Wrapped summary for a period (e.g. a month or season). */
export function useWrapped(periodId: string | null) {
  const uid = useSession((s) => s.uid);
  const enabled = !!uid && !!periodId;
  return useDocQuery<Wrapped>(
    ['wrapped', uid, periodId],
    enabled ? paths.wrappedDoc(uid as string, periodId as string) : null,
    enabled,
  );
}

/** A single parlay slip by id. */
export function useParlay(id: string | null) {
  return useDocQuery<ParlaySlip>(['parlay', id], id ? paths.parlay(id) : null, !!id);
}

/** Parlay slips — all live, or just the current user's, per the filter. */
export function useParlaySlips(filter: { mine?: boolean; status?: ParlaySlip['status'] } = {}, max = 30) {
  const uid = useSession((s) => s.uid);
  const constraints = [] as Parameters<typeof useCollectionQuery>[2];
  if (filter.mine && uid) constraints.push(where('uid', '==', uid));
  if (filter.status) constraints.push(where('status', '==', filter.status));
  constraints.push(orderBy('createdAt', 'desc'), fbLimit(max));
  const enabled = filter.mine ? !!uid : true;
  return useCollectionQuery<ParlaySlip>(
    ['parlays', filter.mine ? uid : 'all', filter.status ?? 'any', max],
    paths.parlays(),
    constraints,
    enabled,
  );
}

/** A single squares game by id. */
export function useSquares(id: string | null) {
  return useDocQuery<SquaresGame>(['squares', id], id ? paths.squaresGame(id) : null, !!id);
}

/** A single bracket by id. */
export function useBracket(id: string | null) {
  return useDocQuery<Bracket>(['bracket', id], id ? paths.bracket(id) : null, !!id);
}

/** Sports fixtures — optionally narrowed by sport / league / status. */
export function useFixtures(
  filter: { sport?: string; league?: string; status?: Fixture['status'] } = {},
  max = 50,
) {
  const constraints = [] as Parameters<typeof useCollectionQuery>[2];
  if (filter.sport) constraints.push(where('sport', '==', filter.sport));
  if (filter.league) constraints.push(where('league', '==', filter.league));
  if (filter.status) constraints.push(where('status', '==', filter.status));
  constraints.push(orderBy('startsAt', 'asc'), fbLimit(max));
  return useCollectionQuery<Fixture>(
    ['fixtures', filter.sport ?? 'any', filter.league ?? 'any', filter.status ?? 'any', max],
    paths.fixtures(),
    constraints,
    true,
  );
}

/** A single fixture by id (live scores stream in). */
export function useFixture(id: string | null) {
  return useDocQuery<Fixture>(['fixture', id], id ? paths.fixture(id) : null, !!id);
}

/** Currently-live fixtures across all sports. */
export function useLiveFixtures(max = 30) {
  return useCollectionQuery<Fixture>(
    ['fixtures', 'live', max],
    paths.fixtures(),
    [where('status', '==', 'live'), orderBy('startsAt', 'asc'), fbLimit(max)],
    true,
  );
}

/** The head-to-head rivalry doc between the current user and another user. */
export function useRivalry(otherUid: string | null) {
  const uid = useSession((s) => s.uid);
  const pairId = uid && otherUid ? rivalryPairId(uid, otherUid) : null;
  return useDocQuery<Rivalry>(
    ['rivalry', pairId],
    pairId ? paths.rivalry(pairId) : null,
    !!pairId,
  );
}

/** Live crew chat for a group, oldest→newest (capped). */
export function useCrewChat(groupId: string | null, max = 100) {
  return useCollectionQuery<ChatMessage>(
    ['crewChat', groupId, max],
    groupId ? paths.crewChat(groupId) : null,
    [orderBy('createdAt', 'asc'), fbLimit(max)],
    !!groupId,
  );
}
