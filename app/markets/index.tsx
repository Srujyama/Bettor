/**
 * Markets feed — the prediction-markets home. A "Trending" rail (sorted by heat)
 * and a "New" list, each rendered as MarketCards. Category filter chips narrow
 * the list. All reads are live (useMarkets / useTrendingMarkets); trading happens
 * on the detail screen. "Chips have no cash value" stays visible.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, EmptyState, Pill, Screen, Txt } from '@/components/ui';
import { MarketCard } from '@/components/domain';
import { useMarkets, useTrendingMarkets } from '@/hooks/data';
import type { Market } from '@/shared/schemas-markets';

const CATEGORIES = ['all', 'sports', 'crypto', 'politics', 'weather', 'culture', 'custom'] as const;
type Category = (typeof CATEGORIES)[number];

export default function MarketsFeedScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<Category>('all');

  const filter = useMemo(
    () => (category === 'all' ? {} : { category }),
    [category],
  );
  const { data: newMarkets, isLoading } = useMarkets(filter);
  const { data: trending } = useTrendingMarkets(10);

  const open = (id: string) => router.push(`/markets/${id}`);

  const trendingFiltered = (trending ?? []).filter(
    (m: Market) => category === 'all' || m.category === category,
  );

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Markets',
          headerRight: () => (
            <Button
              label="＋"
              tone="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => router.push('/markets/create')}
            />
          ),
        }}
      />

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
      >
        {CATEGORIES.map((c) => (
          <Pressable key={c} onPress={() => setCategory(c)}>
            <Pill label={c} tone={c === category ? 'jade' : 'muted'} />
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48, gap: 16 }}>
        {trendingFiltered.length > 0 ? (
          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <Txt variant="title">🔥 Trending</Txt>
            </View>
            {trendingFiltered.slice(0, 4).map((m: Market) => (
              <MarketCard key={m.marketId} market={m} onPress={open} />
            ))}
          </View>
        ) : null}

        <View className="gap-3">
          <Txt variant="title">New markets</Txt>
          {isLoading ? (
            <Txt variant="caption" muted>
              Loading markets…
            </Txt>
          ) : (newMarkets ?? []).length === 0 ? (
            <EmptyState
              emoji="📈"
              title="No markets yet"
              subtitle="Be the first to open one."
              actionLabel="Create a market"
              onAction={() => router.push('/markets/create')}
            />
          ) : (
            (newMarkets ?? []).map((m: Market) => (
              <MarketCard key={m.marketId} market={m} onPress={open} />
            ))
          )}
        </View>

        <View className="flex-row justify-between pt-2">
          <Button
            label="Your positions →"
            tone="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => router.push('/markets/positions')}
          />
        </View>

        <Txt variant="caption" muted className="px-1">
          Markets settle in Chips. Chips have no cash value.
        </Txt>
      </ScrollView>
    </Screen>
  );
}
