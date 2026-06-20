/**
 * DailySpinDial — the once-a-day free wheel. Renders the DAILY_SPIN.PRIZES as
 * wedges and, when the server returns the winning `prizeIndex`, spins the dial
 * with a long decelerating rotation that lands the pointer on that exact wedge.
 * The PARENT owns the dailySpin callable; this owns the spin animation + the
 * cooldown copy. Reduce-motion snaps to the result.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { DAILY_SPIN } from '@/shared';

interface Props {
  /** Winning index from the server (-1/null = not spun yet). */
  prizeIndex: number | null;
  /** Spin is in flight. */
  spinning?: boolean;
  /** Whether the spin is available right now. */
  ready: boolean;
  /** Cooldown copy when not ready (e.g. "12h 04m"). */
  readyLabel?: string;
  onSpin: () => void;
}

const SEG = DAILY_SPIN.PRIZES.length;
const SEG_DEG = 360 / SEG;
const SEG_COLORS = [colors.jade, colors.royal, colors.coral, colors.gold];

export function DailySpinDial({ prizeIndex, spinning, ready, readyLabel, onSpin }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const rot = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (prizeIndex == null || prizeIndex < 0) return;
    // Land the pointer (top) on the winning wedge center, after several turns.
    const target = 360 * 5 - (prizeIndex * SEG_DEG + SEG_DEG / 2);
    rot.value = reduceMotion
      ? target % 360
      : withTiming(target, { duration: 3200, easing: Easing.out(Easing.cubic) });
  }, [prizeIndex, reduceMotion, rot]);

  const dialStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <View className="items-center gap-4 rounded-card border border-royal/30 bg-surface p-6">
      <View className="items-center">
        {/* Pointer */}
        <Txt style={{ fontSize: 18, marginBottom: -6, zIndex: 2 }}>🔻</Txt>
        <Animated.View
          style={[
            dialStyle,
            {
              width: 180,
              height: 180,
              borderRadius: 90,
              borderWidth: 3,
              borderColor: colors.gold,
              overflow: 'hidden',
              backgroundColor: colors.surface,
            },
          ]}
        >
          {DAILY_SPIN.PRIZES.map((prize, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                width: 2,
                height: 90,
                backgroundColor: 'rgba(255,255,255,0.08)',
                transform: [{ rotate: `${i * SEG_DEG}deg` }],
                transformOrigin: 'bottom',
              }}
            />
          ))}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="caption" muted>
              {SEG} prizes
            </Txt>
          </View>
        </Animated.View>
      </View>

      <View className="flex-row flex-wrap justify-center gap-1.5">
        {DAILY_SPIN.PRIZES.map((p, i) => (
          <View
            key={i}
            className="rounded-pill px-2 py-0.5"
            style={{ backgroundColor: `${SEG_COLORS[i % SEG_COLORS.length]}22` }}
          >
            <Txt variant="caption" style={{ color: SEG_COLORS[i % SEG_COLORS.length] }}>
              {p === 0 ? '—' : `+${p}`}
            </Txt>
          </View>
        ))}
      </View>

      <Button
        label={ready ? 'Spin' : readyLabel ? `Next spin in ${readyLabel}` : 'Come back tomorrow'}
        tone="royal"
        size="lg"
        fullWidth
        disabled={!ready || !!spinning}
        loading={!!spinning}
        onPress={onSpin}
      />
    </View>
  );
}
