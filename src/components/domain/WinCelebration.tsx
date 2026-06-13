/**
 * WinCelebration — a full-screen overlay that reads useUi().celebrate and, when
 * set, shows a gold glow, a bounded burst of confetti (simple animated views —
 * no new deps), the won amount via ChipCounter, and Close / Share actions. It
 * auto-dismisses after a few seconds and clears the store. Reduce-motion keeps
 * the confetti static and just fades the panel in.
 *
 * This is the one domain component that reads useUi directly (per the spec) so
 * a single mount near the app root can fire from anywhere.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Button, ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { useUi } from '@/stores/ui';

const CONFETTI_COLORS = [colors.gold, colors.jade, colors.coral, colors.royal];
const PIECE_COUNT = 28;
const AUTO_DISMISS_MS = 4500;

interface Props {
  /** Fires when the user taps Share (caller wires capture/share). */
  onShare?: (betId: string) => void;
}

export function WinCelebration({ onShare }: Props) {
  const celebrate = useUi((s) => s.celebrate);
  const clearCelebrate = useUi((s) => s.clearCelebrate);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!celebrate) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = setTimeout(clearCelebrate, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [celebrate, clearCelebrate]);

  if (!celebrate) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(220)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10,11,15,0.82)',
      }}
    >
      {/* Gold glow */}
      <LinearGradient
        colors={[`${colors.gold}26`, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '70%' }}
      />

      {!reduceMotion ? <Confetti /> : null}

      <View className="items-center gap-3 px-8">
        <Txt style={{ fontSize: 56 }}>🎉</Txt>
        <Txt variant="title" style={{ color: colors.gold }}>
          You won!
        </Txt>
        <ChipCounter value={celebrate.amount} size={56} color={colors.gold} prefix="+" />
        <Txt variant="caption" muted className="text-center">
          Chips have no real-world cash value.
        </Txt>

        <View className="mt-4 w-64 gap-2">
          {onShare ? (
            <Button
              label="Share your win"
              tone="gold"
              onPress={() => onShare(celebrate.betId)}
            />
          ) : null}
          <Button label="Close" tone="ghost" onPress={clearCelebrate} />
        </View>
      </View>
    </Animated.View>
  );
}

function Confetti() {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        key: i,
        x: Math.random() * width,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8,
        delay: Math.random() * 400,
        duration: 1600 + Math.random() * 1400,
        drift: (Math.random() - 0.5) * 80,
      })),
    [width],
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map(({ key, ...p }) => (
        <ConfettiPiece key={key} {...p} fallTo={height + 40} />
      ))}
    </View>
  );
}

function ConfettiPiece({
  x,
  color,
  size,
  delay,
  duration,
  drift,
  fallTo,
}: {
  x: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  fallTo: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) }));
  }, [t, delay, duration]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: t.value * fallTo },
      { translateX: t.value * drift },
      { rotate: `${t.value * 540}deg` },
    ],
    opacity: 1 - t.value * 0.4,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: -20,
          left: x,
          width: size,
          height: size * 0.5,
          borderRadius: 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
