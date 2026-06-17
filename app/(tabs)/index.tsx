/**
 * FEED tab — the home screen. A greeting + tappable wallet chip, a horizontal
 * strip of the user's live bets, and the social activity feed. Pull-to-refresh
 * and an EmptyState that nudges first-bet creation.
 */
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, ChipCounter, EmptyState, Pill, Screen, Txt } from '@/components/ui';
import { ActivityRow, BetCard } from '@/components/domain';
import { useCurrentUser, useFeed, useUserBets } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';
import { BET_STATUS } from '@/shared/constants';
import type { Bet, FeedItem } from '@/shared/schemas';

const LIVE_STATUSES: string[] = [
  BET_STATUS.OPEN,
  BET_STATUS.LOCKED,
  BET_STATUS.PENDING_RESOLUTION,
  BET_STATUS.DISPUTED,
];

export default function FeedScreen() {
  const uid = useSession((s) => s.uid);
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const { data: feed, isLoading } = useFeed();
  const { data: myBets } = useUserBets(uid);
  const [refreshing, setRefreshing] = useState(false);

  const liveBets = (myBets ?? []).filter((b) => LIVE_STATUSES.includes(b.status));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['feed'] }),
      qc.invalidateQueries({ queryKey: ['bets'] }),
      qc.invalidateQueries({ queryKey: ['wallet'] }),
    ]);
    setRefreshing(false);
  }, [qc]);

  const greeting = me?.displayName ? `Welcome back, ${me.displayName.split(' ')[0]}` : 'Welcome to Chipd';

  const openBet = (betId: string) => router.push(`/bet/${betId}`);
  const onFeedPress = (item: FeedItem) => {
    if (item.betId) router.push(`/bet/${item.betId}`);
  };

  return (
    <Screen>
      <FlashList
        data={feed ?? []}
        keyExtractor={(item) => item.itemId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.jade} />
        }
        ListHeaderComponent={
          <Header greeting={greeting} balance={me?.chipsBalance ?? 0} held={me?.chipsHeld ?? 0} liveBets={liveBets} onOpenBet={openBet} />
        }
        renderItem={({ item }) => <ActivityRow item={item} onPress={onFeedPress} />}
        ListEmptyComponent={
          isLoading ? (
            <View className="py-16 items-center">
              <Txt variant="body" dim>
                Loading your feed…
              </Txt>
            </View>
          ) : (
            <EmptyState
              emoji="🎲"
              title="Nothing here yet"
              subtitle="When friends create and settle bets, you'll see the action here."
              actionLabel="Create your first bet"
              onAction={() => router.push('/(modals)/create-bet')}
            />
          )
        }
      />
    </Screen>
  );
}

function Header({
  greeting,
  balance,
  held,
  liveBets,
  onOpenBet,
}: {
  greeting: string;
  balance: number;
  held: number;
  liveBets: Bet[];
  onOpenBet: (betId: string) => void;
}) {
  return (
    <View className="gap-4 pb-3 pt-1">
      {/* Greeting + wallet chip */}
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Chipd
          </Txt>
          <Txt variant="heading" numberOfLines={1}>
            {greeting}
          </Txt>
        </View>
        <Pressable
          onPress={() => router.push('/wallet')}
          accessibilityRole="button"
          accessibilityLabel="Open wallet"
          className="flex-row items-center gap-2 rounded-pill border border-hairline bg-surface-raised px-3 py-2"
        >
          <Txt style={{ fontSize: 16 }}>🪙</Txt>
          <ChipCounter value={balance} size={18} color={colors.gold} />
        </Pressable>
      </View>

      {held > 0 ? (
        <Pill label={`${held.toLocaleString('en-US')} Chips in play`} tone="gold" />
      ) : null}

      {/* Your live bets strip */}
      {liveBets.length > 0 ? (
        <View className="gap-3">
          <Txt variant="label" dim className="uppercase tracking-widest">
            Your live bets
          </Txt>
          <FlashList
            data={liveBets}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(b) => b.betId}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item }) => (
              <View style={{ width: 300 }}>
                <BetCard bet={item} onPress={onOpenBet} />
              </View>
            )}
          />
        </View>
      ) : null}

      {/* Activity heading */}
      <Txt variant="label" dim className="uppercase tracking-widest">
        Activity
      </Txt>
    </View>
  );
}
