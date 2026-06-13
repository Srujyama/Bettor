/**
 * HeadToHeadBar — a single horizontal bar split by two players' win counts in a
 * rivalry. The left segment (jade, "you") grows with your wins, the right
 * (coral, "them") with theirs; ties render a faint sliver. Presentational only.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  leftWins: number;
  rightWins: number;
  leftLabel?: string;
  rightLabel?: string;
  height?: number;
}

export function HeadToHeadBar({
  leftWins,
  rightWins,
  leftLabel = 'You',
  rightLabel = 'Them',
  height = 14,
}: Props) {
  const total = leftWins + rightWins;
  const leftPct = total === 0 ? 0.5 : leftWins / total;
  const rightPct = total === 0 ? 0.5 : rightWins / total;

  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between">
        <Txt variant="caption" style={{ color: colors.jade }}>
          {leftLabel} · {leftWins}
        </Txt>
        <Txt variant="caption" style={{ color: colors.coral }}>
          {rightWins} · {rightLabel}
        </Txt>
      </View>
      <View
        className="flex-row overflow-hidden rounded-pill"
        style={{ height, backgroundColor: colors.surfaceSunken }}
      >
        <View style={{ flex: Math.max(0.0001, leftPct), backgroundColor: colors.jade }} />
        <View style={{ width: 2, backgroundColor: colors.ink }} />
        <View style={{ flex: Math.max(0.0001, rightPct), backgroundColor: colors.coral }} />
      </View>
    </View>
  );
}
