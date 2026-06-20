/**
 * StreakMeter — a horizontal progress bar toward the next streak milestone using
 * the shared `streakMeterProgress` helper. Shows the current consecutive-day
 * streak, a flame, and the next milestone. Optionally renders a compact 7-day
 * calendar dot row (the rewards hub uses the full variant).
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { streakMeterProgress } from '@/shared';

interface Props {
  /** Consecutive active days. */
  streak: number;
  /** Show the milestone progress bar (default true). */
  showBar?: boolean;
}

export function StreakMeter({ streak, showBar = true }: Props) {
  const { progress, nextMilestone } = streakMeterProgress(streak);
  const pct = Math.round(progress * 100);

  return (
    <View className="rounded-card border border-coral/30 bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Txt style={{ fontSize: 22 }}>🔥</Txt>
          <Txt variant="title" style={{ color: colors.coral }}>
            {streak}
          </Txt>
          <Txt variant="caption" muted>
            day{streak === 1 ? '' : 's'}
          </Txt>
        </View>
        <Txt variant="caption" muted>
          Next: {nextMilestone}d
        </Txt>
      </View>

      {showBar ? (
        <View className="mt-3 h-2.5 overflow-hidden rounded-pill bg-surface-sunken">
          <View
            style={{ width: `${pct}%`, backgroundColor: colors.coral }}
            className="h-full rounded-pill"
          />
        </View>
      ) : null}
    </View>
  );
}
