/**
 * FIXTURE DETAIL — one game. Big matchup header with live score + clock, the
 * league chip, a "Bet on this game" CTA that opens a bet pre-linked to the
 * fixture (createBetFromFixture, which auto-resolves from the final score), an
 * "Add to parlay" path into the parlay builder, and the list of related bets
 * already opened on this game. Read-only except the two delegated actions.
 */
import { ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable } from 'react-native';
import { Card, EmptyState, Screen, Txt } from '@/components/ui';
import { BetCard, LeagueChip, LiveScoreBadge, SportsBetButton } from '@/components/domain';
import { useFixture, useFixtureBets } from '@/features/sports/hooks';
import { useCreateBetFromFixture } from '@/features/sports/mutations';
import { colors } from '@/theme';
import type { Bet } from '@/shared/schemas';
import type { Fixture } from '@/shared/schemas-ext';

export default function FixtureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fixtureId = id ?? null;

  const { data: fixture, isLoading } = useFixture(fixtureId);
  const { data: relatedBets } = useFixtureBets(fixtureId);
  const createFromFixture = useCreateBetFromFixture();

  if (isLoading || !fixture) {
    return (
      <Screen>
        <Stack.Screen options={{ headerShown: false }} />
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" dim>
            {isLoading ? 'Loading game…' : 'Game not found.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  const onBet = async () => {
    if (!fixtureId) return;
    try {
      const res = await createFromFixture.mutateAsync({
        fixtureId,
        market: 'Match Winner',
      });
      const betId = (res as { betId?: string }).betId;
      if (betId) router.push(`/bet/${betId}`);
    } catch {
      // toast already surfaced by the mutation
    }
  };

  const onAddToParlay = () => {
    if (!fixtureId) return;
    // Hand off to the parlay builder in the play stack with this fixture preselected.
    router.push(
      `/play/parlay?addFixtureId=${encodeURIComponent(fixtureId)}&label=${encodeURIComponent(
        `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      )}`,
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }}>
        {/* Top bar */}
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Txt variant="label" dim>
              ‹ Back
            </Txt>
          </Pressable>
          <LiveScoreBadge fixture={fixture} />
        </View>

        {/* Matchup */}
        <Card>
          <View className="mb-3 flex-row items-center justify-between">
            <LeagueChip league={fixture.league} sport={fixture.sport} />
            <Txt variant="caption" muted>
              {fixture.sport}
            </Txt>
          </View>
          <Matchup fixture={fixture} />
        </Card>

        {/* Primary actions */}
        <SportsBetButton
          fixture={fixture}
          onBet={onBet}
          onAddToParlay={onAddToParlay}
          loading={createFromFixture.isPending}
        />

        {/* Related bets */}
        <View className="gap-3">
          <Txt variant="label" dim className="uppercase tracking-widest">
            Bets on this game · {(relatedBets ?? []).length}
          </Txt>
          {(relatedBets ?? []).length === 0 ? (
            <EmptyState
              emoji="🎯"
              title="No bets on this yet"
              subtitle="Open the first bet on this game — it settles itself from the final score."
            />
          ) : (
            (relatedBets ?? []).map((b) => (
              <BetCard key={b.betId} bet={b as unknown as Bet} onPress={(betId) => router.push(`/bet/${betId}`)} />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function TeamLine({
  name,
  logo,
  score,
  showScore,
  winner,
}: {
  name: string;
  logo?: string | null;
  score?: number | null;
  showScore: boolean;
  winner: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surfaceRaised,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logo ? (
          <Image source={{ uri: logo }} style={{ width: 40, height: 40 }} contentFit="cover" />
        ) : (
          <Txt variant="heading" muted>
            {name.slice(0, 1)}
          </Txt>
        )}
      </View>
      <Txt
        variant="title"
        numberOfLines={1}
        className="flex-1"
        style={{ color: winner ? colors.jade : colors.text }}
      >
        {name}
      </Txt>
      {showScore ? (
        <Txt
          variant="display"
          style={{ color: winner ? colors.jade : colors.textDim, fontVariant: ['tabular-nums'] }}
        >
          {score ?? 0}
        </Txt>
      ) : null}
    </View>
  );
}

function Matchup({ fixture }: { fixture: Fixture }) {
  const showScore = fixture.status === 'live' || fixture.status === 'final';
  const homeWon = fixture.status === 'final' && fixture.winner === 'home';
  const awayWon = fixture.status === 'final' && fixture.winner === 'away';
  const kickoff = new Date(fixture.startsAt).toLocaleString([], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View className="gap-3">
      <TeamLine name={fixture.homeTeam} logo={fixture.homeLogo} score={fixture.homeScore} showScore={showScore} winner={homeWon} />
      <View className="h-px bg-hairline" />
      <TeamLine name={fixture.awayTeam} logo={fixture.awayLogo} score={fixture.awayScore} showScore={showScore} winner={awayWon} />
      <Txt variant="caption" muted className="text-center">
        {fixture.status === 'scheduled'
          ? `Kickoff ${kickoff}`
          : fixture.status === 'live'
            ? `In progress · ${fixture.period ?? 'Live'}`
            : fixture.winner === 'draw'
              ? 'Full time · Draw'
              : 'Full time'}
      </Txt>
    </View>
  );
}
