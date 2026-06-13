/**
 * Public profile of another user. Shows their identity + public stats, a
 * head-to-head record placeholder (the materialized H2H ledger arrives from a CF),
 * and a contextual friend action: add / cancel / accept / "Friends", driven by
 * the current user's friend edge and fns.sendFriendRequest / respondFriendRequest.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Avatar, Button, Card, Pill, Screen, Txt } from '@/components/ui';
import { ProfileFlair, StatBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useCurrentUser, useFriends, useUser } from '@/hooks/data';
import { useSendFriendRequest, useRespondFriendRequest } from '@/features/social/hooks';
import { formatChips, formatChipsCompact } from '@/shared/money';
import type { Friend, User } from '@/shared/schemas';
import type { EquippedCosmetics } from '@/shared/schemas-ext';

/** Expansion denorm fields written onto the user doc by the economy CFs. */
type CosmeticUserView = User & {
  equipped?: EquippedCosmetics | null;
  pro?: { active?: boolean; expiresAt?: number | null } | null;
};

/** Whether the user currently holds an active Pro subscription. */
function isProActive(user: CosmeticUserView): boolean {
  const pro = user.pro;
  if (!pro?.active) return false;
  return pro.expiresAt == null || pro.expiresAt > Date.now();
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const targetUid = typeof id === 'string' ? id : '';

  const { data: me } = useCurrentUser();
  const { data: user, isLoading } = useUser(targetUid || null);
  const { data: friends } = useFriends();

  const edge = useMemo<Friend | null>(
    () => (friends ?? []).find((f) => f.friendUid === targetUid) ?? null,
    [friends, targetUid],
  );

  const sendRequest = useSendFriendRequest();
  const respond = useRespondFriendRequest();

  const isSelf = !!me && me.uid === targetUid;
  const stats = useMemo(() => {
    const games = (user?.winCount ?? 0) + (user?.lossCount ?? 0);
    const winRate = games > 0 ? Math.round(((user?.winCount ?? 0) / games) * 100) : 0;
    return { games, winRate };
  }, [user]);

  return (
    <Screen>
      <Stack.Screen options={{ title: user?.displayName ?? 'Profile' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {!user && isLoading ? (
          <View className="items-center py-16">
            <Txt variant="body" muted>
              Loading…
            </Txt>
          </View>
        ) : !user ? (
          <View className="items-center py-16">
            <Txt variant="heading">User not found</Txt>
          </View>
        ) : (
          <>
            <Card raised className="items-center gap-3 py-6">
              <ProfileFlair
                uri={user.photoURL}
                name={user.displayName}
                size={88}
                equipped={(user as CosmeticUserView).equipped}
                pro={isProActive(user as CosmeticUserView)}
              />
              <View className="items-center gap-1">
                <Txt variant="title" className="text-center">
                  {user.displayName}
                </Txt>
                <Txt variant="body" muted>
                  @{user.handle}
                </Txt>
                <View className="mt-1 flex-row gap-2">
                  <Pill label={`Lv ${user.level}`} tone="gold" />
                  {user.currentStreak > 0 ? (
                    <Pill label={`🔥 ${user.currentStreak}`} tone="gold" />
                  ) : null}
                </View>
              </View>

              {!isSelf ? (
                <FriendAction
                  edge={edge}
                  busy={sendRequest.isPending || respond.isPending}
                  onAdd={() => sendRequest.mutate({ targetUid })}
                  onAccept={() => respond.mutate({ fromUid: targetUid, accept: true })}
                  onDecline={() => respond.mutate({ fromUid: targetUid, accept: false })}
                />
              ) : null}
            </Card>

            {/* Public stats */}
            <View className="flex-row gap-2">
              <StatBadge label="Record" value={`${user.winCount}–${user.lossCount}`} />
              <StatBadge label="Win rate" value={`${stats.winRate}%`} tone="jade" />
              <StatBadge label="Best streak" value={user.bestStreak} tone="gold" />
            </View>
            <View className="flex-row gap-2">
              <StatBadge label="Wagered" value={formatChipsCompact(user.lifetimeWagered)} tone="royal" />
              <StatBadge label="Won" value={formatChipsCompact(user.lifetimeWon)} tone="jade" />
              <StatBadge label="Net" value={formatChipsCompact(user.lifetimeWon - user.lifetimeWagered)} tone="default" />
            </View>

            {/* Head-to-head placeholder */}
            {!isSelf ? (
              <Card className="gap-3">
                <Txt variant="label" dim className="uppercase tracking-wide">
                  Head to head
                </Txt>
                <View className="flex-row items-center justify-between">
                  <View className="items-center gap-1">
                    <Avatar uri={me?.photoURL} name={me?.displayName} size={40} />
                    <Txt variant="caption" dim>
                      You
                    </Txt>
                  </View>
                  <View className="items-center">
                    <Txt variant="title" style={{ color: colors.textDim }}>
                      0 – 0
                    </Txt>
                    <Txt variant="caption" muted>
                      no shared bets yet
                    </Txt>
                  </View>
                  <View className="items-center gap-1">
                    <Avatar uri={user.photoURL} name={user.displayName} size={40} />
                    <Txt variant="caption" dim numberOfLines={1}>
                      {user.displayName}
                    </Txt>
                  </View>
                </View>
                <Txt variant="caption" muted>
                  Your head-to-head record fills in as you settle bets against each other.
                </Txt>
              </Card>
            ) : null}

            <Card className="gap-2">
              <Txt variant="label" dim className="uppercase tracking-wide">
                Lifetime
              </Txt>
              <Row label="Chips wagered" value={formatChips(user.lifetimeWagered)} />
              <Row label="Chips won" value={formatChips(user.lifetimeWon)} valueColor={colors.jade} />
              <Row label="Games played" value={String(stats.games)} />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function FriendAction({
  edge,
  busy,
  onAdd,
  onAccept,
  onDecline,
}: {
  edge: Friend | null;
  busy: boolean;
  onAdd: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!edge) {
    return <Button label="Add friend" tone="jade" loading={busy} onPress={onAdd} />;
  }
  switch (edge.status) {
    case 'accepted':
      return <Pill label="✓ Friends" tone="jade" />;
    case 'pending_out':
      return <Pill label="Request sent" tone="muted" />;
    case 'pending_in':
      return (
        <View className="w-full flex-row gap-2">
          <View className="flex-1">
            <Button label="Accept" tone="jade" size="sm" loading={busy} onPress={onAccept} />
          </View>
          <View className="flex-1">
            <Button label="Decline" tone="ghost" size="sm" loading={busy} onPress={onDecline} />
          </View>
        </View>
      );
    case 'blocked':
      return <Pill label="Blocked" tone="coral" />;
    default:
      return <Button label="Add friend" tone="jade" loading={busy} onPress={onAdd} />;
  }
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Txt variant="body" dim>
        {label}
      </Txt>
      <Txt variant="label" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </Txt>
    </View>
  );
}
