/**
 * Season standings — the full ranked leaderboard for a season. The seasonId
 * arrives as a query param (defaults to the active season). Read-only: ranks are
 * materialized server-side by refreshSeasonStandings / rollSeason.
 */
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Avatar, Card, EmptyState, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useSeason, useSeasonStandings } from '@/features/gamification/hooks';
import { formatChips } from '@/shared/money';
import { useSession } from '@/stores/session';
import type { SeasonStanding } from '@/shared/schemas-ext';

export default function SeasonStandingsScreen() {
  const params = useLocalSearchParams<{ seasonId?: string }>();
  const { data: seasons } = useSeason();
  const seasonId = params.seasonId ?? seasons?.[0]?.seasonId ?? null;
  const { data: standings, isLoading } = useSeasonStandings(seasonId, 200);
  const myUid = useSession((s) => s.uid);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Standings' }} />
      {!isLoading && (standings ?? []).length === 0 ? (
        <EmptyState
          emoji="🏆"
          title="No standings yet"
          subtitle="Standings populate as players settle bets this season."
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 8 }}>
          {(standings ?? []).map((row) => (
            <Row key={row.uid} row={row} highlight={row.uid === myUid} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

function Row({ row, highlight }: { row: SeasonStanding; highlight: boolean }) {
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`;
  return (
    <Card
      raised={highlight}
      className="flex-row items-center gap-3 py-2.5"
      style={highlight ? { borderColor: colors.jade, borderWidth: 1 } : undefined}
    >
      <Txt variant="label" style={{ width: 36, textAlign: 'center' }}>
        {medal}
      </Txt>
      <Avatar uri={row.photoURL} name={row.displayName} size={36} ring={highlight} />
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {row.displayName}
          {highlight ? '  (you)' : ''}
        </Txt>
        <Txt variant="caption" muted>
          {row.winCount} wins · {row.xpEarned.toLocaleString()} XP
        </Txt>
      </View>
      <Txt variant="label" style={{ color: row.netChips >= 0 ? colors.jade : colors.coral }}>
        {row.netChips >= 0 ? '+' : ''}
        {formatChips(row.netChips)}
      </Txt>
    </Card>
  );
}
