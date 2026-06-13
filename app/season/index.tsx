/**
 * Season hub — the current competitive season at a glance: a season progress
 * bar with time left, the player's own rank, a peek at the top standings, and
 * the placement rewards table. Standings + rewards are server-authoritative
 * (rollSeason / refreshSeasonStandings); this screen is read-only.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Avatar, Button, Card, EmptyState, Screen, Txt } from '@/components/ui';
import { SeasonProgressBar } from '@/components/domain';
import { colors } from '@/theme';
import {
  useMySeasonStanding,
  useSeason,
  useSeasonStandings,
} from '@/features/gamification/hooks';
import { SEASON, seasonRankReward } from '@/shared/gamification';
import { formatChips } from '@/shared/money';
import type { SeasonStanding } from '@/shared/schemas-ext';

export default function SeasonScreen() {
  const router = useRouter();
  const { data: seasons, isLoading } = useSeason();
  const season = seasons?.[0] ?? null;
  const { data: top } = useSeasonStandings(season?.seasonId ?? null, 5);
  const { data: mine } = useMySeasonStanding(season?.seasonId ?? null);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!isLoading && !season) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Season' }} />
        <EmptyState
          emoji="🗓️"
          title="No season running"
          subtitle="The next competitive season opens shortly. Keep betting — your stats carry over."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Season' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {season ? (
          <Card raised className="gap-4">
            <SeasonProgressBar
              name={season.name}
              startsAt={season.startsAt}
              endsAt={season.endsAt}
              now={now}
            />
            <View className="flex-row items-center justify-between">
              <View>
                <Txt variant="caption" muted className="uppercase tracking-wide">
                  Your rank
                </Txt>
                <Txt variant="title" style={{ color: colors.gold, fontWeight: '900' }}>
                  {mine ? `#${mine.rank}` : 'Unranked'}
                </Txt>
              </View>
              <View className="items-end">
                <Txt variant="caption" muted className="uppercase tracking-wide">
                  Net Chips
                </Txt>
                <Txt
                  variant="title"
                  style={{ color: (mine?.netChips ?? 0) >= 0 ? colors.jade : colors.coral, fontWeight: '900' }}
                >
                  {mine ? `${mine.netChips >= 0 ? '+' : ''}${formatChips(mine.netChips)}` : '—'}
                </Txt>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Top standings peek */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Txt variant="label" dim className="uppercase tracking-wide">
              Top standings
            </Txt>
            {season ? (
              <Button
                label="See all"
                tone="ghost"
                size="sm"
                fullWidth={false}
                onPress={() => router.push(`/season/standings?seasonId=${season.seasonId}`)}
              />
            ) : null}
          </View>
          {(top ?? []).length === 0 ? (
            <Card className="items-center py-5">
              <Txt variant="caption" muted>
                Standings update through the season — settle a few bets to appear.
              </Txt>
            </Card>
          ) : (
            (top ?? []).map((row) => <StandingRow key={row.uid} row={row} />)
          )}
        </View>

        {/* Rewards table */}
        <RewardsTable />

        <Txt variant="caption" muted className="px-1 text-center">
          Chips are for entertainment only and have no real-world cash value.
        </Txt>
      </ScrollView>
    </Screen>
  );
}

function StandingRow({ row }: { row: SeasonStanding }) {
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`;
  return (
    <Card className="flex-row items-center gap-3 py-2.5">
      <Txt variant="label" style={{ width: 32, textAlign: 'center' }}>
        {medal}
      </Txt>
      <Avatar uri={row.photoURL} name={row.displayName} size={36} />
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {row.displayName}
        </Txt>
        <Txt variant="caption" muted>
          {row.winCount} wins · {row.xpEarned.toLocaleString()} XP
        </Txt>
      </View>
      <Txt
        variant="label"
        style={{ color: row.netChips >= 0 ? colors.jade : colors.coral }}
      >
        {row.netChips >= 0 ? '+' : ''}
        {formatChips(row.netChips)}
      </Txt>
    </Card>
  );
}

function RewardsTable() {
  const rows = useMemo(
    () =>
      SEASON.REWARDS.map((reward, i) => ({ rank: i + 1, reward })).concat([
        { rank: 50, reward: seasonRankReward(50) },
      ]),
    [],
  );
  return (
    <Card className="gap-2">
      <Txt variant="label" dim className="uppercase tracking-wide">
        Placement rewards
      </Txt>
      {rows.map((r) => (
        <View key={r.rank} className="flex-row items-center justify-between">
          <Txt variant="body" dim>
            {r.rank === 50 ? 'Top 50' : `#${r.rank}`}
          </Txt>
          <Txt variant="label" style={{ color: colors.gold }}>
            +{formatChips(r.reward)} Chips
          </Txt>
        </View>
      ))}
      <View className="flex-row items-center justify-between">
        <Txt variant="body" dim>
          Everyone who played
        </Txt>
        <Txt variant="label" style={{ color: colors.gold }}>
          +{formatChips(SEASON.PARTICIPATION_REWARD)} Chips
        </Txt>
      </View>
    </Card>
  );
}
