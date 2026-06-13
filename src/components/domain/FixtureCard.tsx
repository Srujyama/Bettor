/**
 * FixtureCard — the "matchup" surface for a sports fixture in the browse screen.
 * League chip + live/kickoff badge in the header, the two teams stacked with
 * their logos and (when live/final) their scores, and the winner highlighted on
 * a final fixture. Tapping opens the fixture detail. Presentational: data via
 * props, tap fires onPress(fixtureId).
 */
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { LeagueChip } from './LeagueChip';
import { LiveScoreBadge } from './LiveScoreBadge';
import { colors } from '@/theme';
import type { Fixture } from '@/shared/schemas-ext';

interface Props {
  fixture: Fixture;
  onPress: (fixtureId: string) => void;
}

function TeamRow({
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
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.surfaceRaised,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {logo ? (
          <Image source={{ uri: logo }} style={{ width: 28, height: 28 }} contentFit="cover" />
        ) : (
          <Txt variant="caption" muted>
            {name.slice(0, 1)}
          </Txt>
        )}
      </View>
      <Txt
        variant="heading"
        numberOfLines={1}
        className="flex-1"
        style={{ color: winner ? colors.jade : colors.text }}
      >
        {name}
      </Txt>
      {showScore ? (
        <Txt
          variant="heading"
          style={{ color: winner ? colors.jade : colors.textDim, fontVariant: ['tabular-nums'] }}
        >
          {score ?? 0}
        </Txt>
      ) : null}
    </View>
  );
}

export function FixtureCard({ fixture, onPress }: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const showScore = fixture.status === 'live' || fixture.status === 'final';
  const homeWon = fixture.status === 'final' && fixture.winner === 'home';
  const awayWon = fixture.status === 'final' && fixture.winner === 'away';

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(fixture.fixtureId);
  };

  return (
    <Animated.View style={aStyle}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => (scale.value = withSpring(0.98, { damping: 16 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 16 }))}
        accessibilityRole="button"
        accessibilityLabel={`${fixture.homeTeam} versus ${fixture.awayTeam}`}
      >
        <View className="gap-3 rounded-card border border-hairline bg-surface p-4">
          {/* Header: league + status */}
          <View className="flex-row items-center justify-between">
            <LeagueChip league={fixture.league} sport={fixture.sport} />
            <LiveScoreBadge fixture={fixture} />
          </View>

          {/* Teams */}
          <View className="gap-2.5">
            <TeamRow
              name={fixture.homeTeam}
              logo={fixture.homeLogo}
              score={fixture.homeScore}
              showScore={showScore}
              winner={homeWon}
            />
            <View className="h-px bg-hairline" />
            <TeamRow
              name={fixture.awayTeam}
              logo={fixture.awayLogo}
              score={fixture.awayScore}
              showScore={showScore}
              winner={awayWon}
            />
          </View>

          {fixture.status === 'final' && fixture.winner === 'draw' ? (
            <Txt variant="caption" muted className="text-center">
              Draw
            </Txt>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
