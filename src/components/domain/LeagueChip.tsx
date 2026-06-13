/**
 * LeagueChip — a compact league/sport chip (emoji + league code) with an accent
 * tied to the sport. Used in fixture cards and as a filter pill in the sports
 * browse screen. Presentational; `selected` renders a filled state.
 */
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

/** Sport → accent color + emoji. Falls back to a neutral chip. */
const SPORT_META: Record<string, { color: string; emoji: string }> = {
  basketball: { color: colors.coral, emoji: '🏀' },
  football: { color: colors.jade, emoji: '⚽' },
  soccer: { color: colors.jade, emoji: '⚽' },
  mma: { color: colors.gold, emoji: '🥊' },
  baseball: { color: colors.royal, emoji: '⚾' },
  americanfootball: { color: colors.coral, emoji: '🏈' },
};

export function LeagueChip({
  league,
  sport,
  selected = false,
  onPress,
}: {
  league: string;
  sport?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const meta = (sport && SPORT_META[sport]) || { color: colors.muted, emoji: '🎯' };

  const body = (
    <View
      className="flex-row items-center gap-1.5 self-start rounded-pill border px-3 py-1.5"
      style={{
        borderColor: selected ? meta.color : colors.hairline,
        backgroundColor: selected ? `${meta.color}22` : 'rgba(255,255,255,0.04)',
      }}
    >
      <Txt variant="caption">{meta.emoji}</Txt>
      <Txt
        variant="caption"
        className="font-semibold"
        style={{ color: selected ? meta.color : colors.textDim }}
      >
        {league}
      </Txt>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      {body}
    </Pressable>
  );
}
