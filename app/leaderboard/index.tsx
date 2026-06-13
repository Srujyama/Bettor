/**
 * Leaderboard — Friends / Crew / Global × Weekly / All-time. For the pilot we
 * derive a client-side board from the current user + their accepted friends'
 * user docs, ranked by netChips (lifetimeWon − lifetimeWagered). Materialized
 * server boards (and a true Weekly window) will arrive from a Cloud Function;
 * until then this works with whatever data exists and the current user is
 * always highlighted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { EmptyState, Screen, Txt } from '@/components/ui';
import { LeaderboardRow, SegmentedTabs } from '@/components/domain';
import { useCurrentUser, useFriends, useUser } from '@/hooks/data';
import type { Friend, LeaderboardRow as LeaderboardRowData, User } from '@/shared/schemas';

const SCOPES = ['Friends', 'Crew', 'Global'] as const;
const PERIODS = ['Weekly', 'All-time'] as const;
type Scope = (typeof SCOPES)[number];

/** Net = lifetimeWon − lifetimeWagered. */
function netOf(u: { lifetimeWon: number; lifetimeWagered: number }): number {
  return u.lifetimeWon - u.lifetimeWagered;
}

function baseRow(u: User): Omit<LeaderboardRowData, 'rank'> {
  const games = u.winCount + u.lossCount;
  return {
    uid: u.uid,
    displayName: u.displayName,
    photoURL: u.photoURL ?? null,
    handle: u.handle,
    netChips: netOf(u),
    winCount: u.winCount,
    winRate: games > 0 ? u.winCount / games : 0,
    currentStreak: u.currentStreak,
  };
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('Friends');
  const [period, setPeriod] = useState<string>('All-time');

  const { data: me } = useCurrentUser();
  const { data: friends } = useFriends();

  const accepted = useMemo<Friend[]>(
    () => (friends ?? []).filter((f) => f.status === 'accepted'),
    [friends],
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Leaderboard' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <SegmentedTabs tabs={[...SCOPES]} value={scope} onChange={(t) => setScope(t as Scope)} />
        <SegmentedTabs tabs={[...PERIODS]} value={period} onChange={setPeriod} />

        {period === 'Weekly' ? (
          <Txt variant="caption" muted className="px-1">
            Weekly standings are computed server-side and arrive soon. Showing all-time net for now.
          </Txt>
        ) : null}
        {scope === 'Crew' ? (
          <Txt variant="caption" muted className="px-1">
            Crew boards open up once your crews have settled bets. Here is your friend circle.
          </Txt>
        ) : null}
        {scope === 'Global' ? (
          <Txt variant="caption" muted className="px-1">
            The global board is materialized server-side and launches with the pilot. Showing your
            circle in the meantime.
          </Txt>
        ) : null}

        <Board me={me ?? null} friends={accepted} onPressUser={(uid) => router.push(`/user/${uid}`)} />
      </ScrollView>
    </Screen>
  );
}

function Board({
  me,
  friends,
  onPressUser,
}: {
  me: User | null;
  friends: Friend[];
  onPressUser: (uid: string) => void;
}) {
  if (!me && friends.length === 0) {
    return (
      <EmptyState
        emoji="🏆"
        title="No standings yet"
        subtitle="Add friends and settle a few bets to climb the board."
      />
    );
  }

  return <HydratedBoard me={me} friends={friends} onPressUser={onPressUser} />;
}

/**
 * Ranks the current user + accepted friends by netChips descending. To stay safe
 * with the rules of hooks, each friend's live user doc is fetched by a dedicated
 * child component (<FriendHydrator>) — React mounts/unmounts whole children as the
 * friend list changes, so no hook is ever called conditionally or in a varying
 * loop. Children lift their loaded stats up; this parent sorts + assigns ranks.
 */
function HydratedBoard({
  me,
  friends,
  onPressUser,
}: {
  me: User | null;
  friends: Friend[];
  onPressUser: (uid: string) => void;
}) {
  const [hydrated, setHydrated] = useState<Record<string, Omit<LeaderboardRowData, 'rank'>>>({});

  const report = useCallback((uid: string, row: Omit<LeaderboardRowData, 'rank'>) => {
    setHydrated((prev) => {
      const existing = prev[uid];
      if (existing && existing.netChips === row.netChips && existing.displayName === row.displayName) {
        return prev;
      }
      return { ...prev, [uid]: row };
    });
  }, []);

  const ranked = useMemo(() => {
    const partials: { row: Omit<LeaderboardRowData, 'rank'>; isMe: boolean }[] = [];
    if (me) partials.push({ row: baseRow(me), isMe: true });
    for (const f of friends) {
      const row =
        hydrated[f.friendUid] ??
        ({
          uid: f.friendUid,
          displayName: f.displayNameCache ?? 'Friend',
          photoURL: f.photoURLCache ?? null,
          handle: f.handleCache,
          netChips: 0,
          winCount: 0,
          winRate: 0,
          currentStreak: 0,
        } satisfies Omit<LeaderboardRowData, 'rank'>);
      partials.push({ row, isMe: false });
    }
    partials.sort((a, b) => b.row.netChips - a.row.netChips || a.row.uid.localeCompare(b.row.uid));
    return partials.map((p, i) => ({ row: { ...p.row, rank: i + 1 }, isMe: p.isMe }));
  }, [me, friends, hydrated]);

  return (
    <View className="gap-2">
      {/* Invisible hydrators — one per friend, each owns a single useUser hook. */}
      {friends.map((f) => (
        <FriendHydrator key={f.friendUid} friend={f} onReport={report} />
      ))}
      {ranked.map(({ row, isMe }) => (
        <LeaderboardRow
          key={row.uid}
          row={row}
          highlight={isMe}
          onPress={isMe ? undefined : onPressUser}
        />
      ))}
    </View>
  );
}

/** Subscribes to one friend's user doc and reports a leaderboard row upward. Renders nothing. */
function FriendHydrator({
  friend,
  onReport,
}: {
  friend: Friend;
  onReport: (uid: string, row: Omit<LeaderboardRowData, 'rank'>) => void;
}) {
  const { data: user } = useUser(friend.friendUid);
  useEffect(() => {
    if (user) onReport(friend.friendUid, baseRow(user));
  }, [user, friend.friendUid, onReport]);
  return null;
}
