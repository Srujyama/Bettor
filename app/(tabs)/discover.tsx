/**
 * DISCOVER tab — browse open public bets. SegmentedTabs filter (All / Sports /
 * Social / Closing soon), a search field, and a FlashList of BetCard. Tapping a
 * card deep-links to the bet detail.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EmptyState, Input, Screen, Txt } from '@/components/ui';
import { BetCard, SegmentedTabs } from '@/components/domain';
import { useDiscoverBets } from '@/hooks/data';
import { BET_CATEGORY } from '@/shared/constants';
import type { Bet } from '@/shared/schemas';

const FILTERS = ['All', 'Sports', 'Social', 'Closing soon'] as const;
type Filter = (typeof FILTERS)[number];

/** Window for the "closing soon" filter — bets that lock within this. */
const CLOSING_SOON_MS = 6 * 60 * 60 * 1000;

export default function DiscoverScreen() {
  const { data: bets, isLoading } = useDiscoverBets(50);
  const [filter, setFilter] = useState<Filter>('All');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.trim().toLowerCase();
    return (bets ?? []).filter((b) => {
      if (filter === 'Sports' && b.category !== BET_CATEGORY.SPORTS) return false;
      if (filter === 'Social' && b.category !== BET_CATEGORY.SOCIAL) return false;
      if (filter === 'Closing soon') {
        const remaining = b.lockAt - now;
        if (remaining <= 0 || remaining > CLOSING_SOON_MS) return false;
      }
      if (q) {
        const haystack = `${b.title} ${b.description} ${b.creatorName ?? ''} ${b.tags.join(' ')}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [bets, filter, search]);

  const openBet = (betId: string) => router.push(`/bet/${betId}`);

  const openSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(modals)/search');
  };

  return (
    <Screen>
      <View className="gap-3 px-4 pt-1">
        <View className="flex-row items-center justify-between">
          <Txt variant="title">Discover</Txt>
          <Pressable
            onPress={openSearch}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Search"
            className="h-9 w-9 items-center justify-center rounded-full bg-surface-raised"
          >
            <Txt style={{ fontSize: 16 }}>🔍</Txt>
          </Pressable>
        </View>
        <Input
          placeholder="Search bets, people, tags…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <SegmentedTabs
          tabs={FILTERS as unknown as string[]}
          value={filter}
          onChange={(t) => setFilter(t as Filter)}
        />
      </View>

      <FlashList
        data={filtered}
        keyExtractor={(b: Bet) => b.betId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        renderItem={({ item }) => <BetCard bet={item} onPress={openBet} />}
        ListEmptyComponent={
          isLoading ? (
            <View className="py-16 items-center">
              <Txt variant="body" dim>
                Finding live bets…
              </Txt>
            </View>
          ) : (
            <EmptyState
              emoji="🔍"
              title="No bets match"
              subtitle={
                search || filter !== 'All'
                  ? 'Try a different filter or search term.'
                  : 'Be the first to open a bet for the room.'
              }
              actionLabel="Create a bet"
              onAction={() => router.push('/(modals)/create-bet')}
            />
          )
        }
      />
    </Screen>
  );
}
