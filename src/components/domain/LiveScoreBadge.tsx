/**
 * LiveScoreBadge — a small status chip for a fixture. A pulsing jade dot + the
 * period/clock when LIVE, a kickoff time when SCHEDULED, and a muted "Final"
 * once a fixture is over. Reduce-motion degrades the pulse to a steady dot.
 * Purely presentational.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import type { Fixture } from '@/shared/schemas-ext';

function kickoffLabel(startsAt: number): string {
  const d = new Date(startsAt);
  const now = Date.now();
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const day = d.toLocaleDateString([], { weekday: 'short' });
  return `${day} ${time}`;
}

export function LiveScoreBadge({ fixture }: { fixture: Fixture }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useSharedValue(1);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (fixture.status !== 'live' || reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.3, { duration: 700 }), -1, true);
  }, [fixture.status, reduceMotion, pulse]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (fixture.status === 'live') {
    return (
      <View className="flex-row items-center gap-1.5 self-start rounded-pill border border-jade/30 bg-jade/15 px-2.5 py-1">
        <Animated.View
          style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.jade }, dotStyle]}
        />
        <Txt variant="caption" className="font-semibold text-jade">
          {fixture.period ?? 'LIVE'}
        </Txt>
      </View>
    );
  }

  if (fixture.status === 'final') {
    return (
      <View className="self-start rounded-pill border border-hairline bg-white/5 px-2.5 py-1">
        <Txt variant="caption" className="font-semibold text-muted">
          Final
        </Txt>
      </View>
    );
  }

  return (
    <View className="self-start rounded-pill border border-royal/30 bg-royal/15 px-2.5 py-1">
      <Txt variant="caption" className="font-semibold text-royal">
        {kickoffLabel(fixture.startsAt)}
      </Txt>
    </View>
  );
}
