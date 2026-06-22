/**
 * NEAR YOU — local bets happening around the user. We get a coarse GPS fix (with
 * a clear permission ask + manual fallback), run a geohash radius query, and show
 * open local bets sorted nearest-first with a distance + neighborhood label.
 *
 * Privacy: only an approximate distance + coarse area are ever shown; precise
 * coordinates are fuzzed server-side and never displayed.
 */
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, Card, EmptyState, Screen, Txt } from '@/components/ui';
import { BetCard, DistancePill } from '@/components/domain';
import { useNearbyLocation } from '@/features/location/hooks';
import { useNearbyBets, type NearbyBet } from '@/features/location/nearby';
import { RADIUS_PRESETS } from '@/shared/geo';
import { NO_CASH_VALUE_DISCLOSURE as NO_CASH } from '@/shared/constants';
import { colors } from '@/theme';

export default function NearbyScreen() {
  const loc = useNearbyLocation();
  const { data: bets, isLoading, isRefetching, refetch } = useNearbyBets(
    loc.position,
    loc.radiusMeters,
    60,
  );

  const onRefresh = useCallback(() => {
    Haptics.selectionAsync();
    loc.refresh();
    refetch();
  }, [loc, refetch]);

  const renderItem = useCallback(
    ({ item }: { item: NearbyBet }) => (
      <View className="mb-3 gap-1.5">
        <DistancePill distanceMeters={item.distanceMeters} placeName={item.placeName} />
        <BetCard bet={item} onPress={(id) => router.push(`/bet/${id}`)} />
      </View>
    ),
    [],
  );

  // ── No location yet → gate ──
  if (!loc.hasLocation) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Near you' }} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View className="items-center gap-3 py-10">
            <Txt style={{ fontSize: 56 }}>📍</Txt>
            <Txt variant="title" className="text-center">
              Bets happening around you
            </Txt>
            <Txt variant="body" dim className="text-center">
              Turn on location to see and join bets posted by people in your area. We only ever show
              an approximate neighborhood — never your exact spot.
            </Txt>
          </View>
          <Button
            label={loc.loading ? 'Getting location…' : 'Use my location'}
            tone="jade"
            size="lg"
            loading={loc.loading}
            onPress={() => loc.enableGps()}
          />
          <Txt variant="caption" muted className="text-center">
            {NO_CASH}
          </Txt>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: loc.placeName ?? 'Near you' }} />

      {/* Radius selector */}
      <View className="border-b border-hairline px-4 pb-3 pt-1">
        <View className="flex-row items-center justify-between">
          <Txt variant="caption" muted>
            Within
          </Txt>
          <Pressable onPress={() => loc.enableGps()}>
            <Txt variant="caption" className="text-jade">
              {loc.placeName ?? 'your area'} · refresh
            </Txt>
          </Pressable>
        </View>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {RADIUS_PRESETS.map((r) => {
            const active = loc.radiusMeters === r.meters;
            return (
              <Pressable
                key={r.meters}
                onPress={() => {
                  Haptics.selectionAsync();
                  loc.setRadius(r.meters);
                }}
                className={`rounded-pill border px-3.5 py-1.5 ${
                  active ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface-raised'
                }`}
              >
                <Txt variant="label" className={active ? 'text-jade' : 'text-text-dim'}>
                  {r.label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlashList
        data={bets ?? []}
        keyExtractor={(b: NearbyBet) => b.betId}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.jade}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              emoji="🗺️"
              title="No local bets yet"
              subtitle="Be the first — post a bet and make it local so people nearby can join."
              actionLabel="Create a local bet"
              onAction={() => router.push('/(modals)/create-bet')}
            />
          ) : null
        }
        ListFooterComponent={
          (bets?.length ?? 0) > 0 ? (
            <Txt variant="caption" muted className="mt-2 text-center">
              {NO_CASH}
            </Txt>
          ) : null
        }
      />
    </Screen>
  );
}
