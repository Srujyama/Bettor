/**
 * Domain data hooks. Screens import ONLY from here for reads — they never touch
 * Firestore directly. Every hook returns a live (onSnapshot-backed) query.
 */
import { orderBy, limit as fbLimit, where } from 'firebase/firestore';
import { useSession } from '@/stores/session';
import { paths } from '@/lib/firebase/paths';
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
