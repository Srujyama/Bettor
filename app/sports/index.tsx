/**
 * SPORTS BROWSE — the live-sports oracle home. A sport/league filter row, a LIVE
 * section (in-progress fixtures), and an UPCOMING section (scheduled kickoffs).
 * Fixtures stream live from the `fixtures` collection (written by the scheduled
 * sync functions); tapping a card opens the fixture detail. Read-only — no money
 * moves here.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { EmptyState, Screen, Txt } from '@/components/ui';
import { FixtureCard, LeagueChip } from '@/components/domain';
import { useFixtures, useLiveFixtures } from '@/features/sports/hooks';
import type { Fixture } from '@/shared/schemas-ext';

/** Sport filters shown as chips. `null` value = All. */
const SPORT_FILTERS: { label: string; sport: string | null }[] = [
  { label: 'All', sport: null },
  { label: 'NBA', sport: 'basketball' },
  { label: 'Football', sport: 'football' },
  { label: 'UFC', sport: 'mma' },
  { label: 'MLB', sport: 'baseball' },
];

/** A row in the flat list: either a section header or a fixture. */
type Row =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'fixture'; key: string; fixture: Fixture };

export default function SportsBrowseScreen() {
  const [sport, setSport] = useState<string | null>(null);

  const { data: live, isLoading: liveLoading } = useLiveFixtures(30);
  const { data: scheduled, isLoading: schedLoading } = useFixtures({
    sport,
    status: 'scheduled',
    max: 60,
  });

  const isLoading = liveLoading || schedLoading;

  // Apply the sport filter to the live list client-side (it's small).
  const liveFiltered = useMemo(
    () => (sport ? (live ?? []).filter((f) => f.sport === sport) : live ?? []),
    [live, sport],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (liveFiltered.length > 0) {
      out.push({ kind: 'header', key: 'h-live', title: 'Live now', count: liveFiltered.length });
      for (const f of liveFiltered) out.push({ kind: 'fixture', key: `l-${f.fixtureId}`, fixture: f });
    }
    const upcoming = scheduled ?? [];
    if (upcoming.length > 0) {
      out.push({ kind: 'header', key: 'h-up', title: 'Upcoming', count: upcoming.length });
      for (const f of upcoming) out.push({ kind: 'fixture', key: `u-${f.fixtureId}`, fixture: f });
    }
    return out;
  }, [liveFiltered, scheduled]);

  const openFixture = (fixtureId: string) => router.push(`/sports/${fixtureId}`);

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="gap-3 px-4 pt-2">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Txt variant="label" dim>
              ‹ Back
            </Txt>
          </Pressable>
          <Txt variant="caption" muted>
            Auto-resolved games
          </Txt>
        </View>
        <Txt variant="title">Live Sports</Txt>

        {/* Sport filter chips */}
        <View className="flex-row flex-wrap gap-2">
          {SPORT_FILTERS.map((f) => (
            <LeagueChip
              key={f.label}
              league={f.label}
              sport={f.sport ?? undefined}
              selected={sport === f.sport}
              onPress={() => setSport(f.sport)}
            />
          ))}
        </View>
      </View>

      <FlashList
        data={rows}
        keyExtractor={(r: Row) => r.key}
        getItemType={(r: Row) => r.kind}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View className="flex-row items-center gap-2 pt-2">
              <Txt variant="label" dim className="uppercase tracking-widest">
                {item.title}
              </Txt>
              <Txt variant="caption" muted>
                {item.count}
              </Txt>
            </View>
          ) : (
            <FixtureCard fixture={item.fixture} onPress={openFixture} />
          )
        }
        ListEmptyComponent={
          isLoading ? (
            <View className="items-center py-16">
              <Txt variant="body" dim>
                Loading the slate…
              </Txt>
            </View>
          ) : (
            <EmptyState
              emoji="📅"
              title="No games right now"
              subtitle="Check back soon — fixtures sync every few minutes."
            />
          )
        }
      />
    </Screen>
  );
}
