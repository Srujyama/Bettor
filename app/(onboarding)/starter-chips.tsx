/**
 * Starter-Chips reveal. The 1,000-Chip signup grant was already minted
 * server-side by verifyAge; this screen is the celebration. We animate the
 * ChipCounter from 0 up to the grant, throw a quick confetti burst (respecting
 * reduce-motion), and then send the user to the optional find-friends step.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Screen, Txt, Button, ChipCounter } from '@/components/ui';
import { colors } from '@/theme';
import { ECONOMY, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const CONFETTI_COLORS = [colors.gold, colors.jade, colors.coral, colors.royal];
const PIECE_COUNT = 24;

export default function StarterChips() {
  const [reduceMotion, setReduceMotion] = useState(false);
  // Start the counter at 0, then animate to the grant once mounted.
  const [value, setValue] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((rm) => {
      setReduceMotion(rm);
      if (rm) {
        setValue(ECONOMY.SIGNUP_GRANT);
      }
    });
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const id = setTimeout(() => setValue(ECONOMY.SIGNUP_GRANT), 350);
    return () => clearTimeout(id);
  }, [reduceMotion]);

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8">
        {/* Gold glow */}
        <LinearGradient
          colors={[`${colors.gold}22`, 'transparent']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }}
        />

        {!reduceMotion ? <Confetti colors={CONFETTI_COLORS} /> : null}

        <Animated.View entering={FadeIn.duration(400)} className="items-center gap-3">
          <Txt style={{ fontSize: 64 }}>🎁</Txt>
          <Txt variant="heading" muted>
            Your welcome bonus
          </Txt>
          <ChipCounter value={value} size={64} color={colors.gold} prefix="+" />
          <Txt variant="body" dim className="mt-1 text-center">
            1,000 Chips, on the house. Enough to get into plenty of action.
          </Txt>
        </Animated.View>
      </View>

      <View className="gap-3 px-6 pb-2">
        <Button
          label="Start betting"
          tone="gold"
          size="lg"
          onPress={() => router.push('/(onboarding)/find-friends')}
        />
        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </View>
    </Screen>
  );
}

/** Bounded one-shot confetti burst (no new deps). */
function Confetti({ colors: palette }: { colors: readonly string[] }) {
  const { width, height } = useWindowDimensions();
  const pieces = Array.from({ length: PIECE_COUNT }, (_, i) => ({
    key: i,
    x: Math.random() * width,
    color: palette[i % palette.length],
    size: 6 + Math.random() * 8,
    delay: Math.random() * 400,
    duration: 1600 + Math.random() * 1400,
    drift: (Math.random() - 0.5) * 90,
    fallTo: height + 40,
  }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map(({ key, ...p }) => (
        <Piece key={key} {...p} />
      ))}
    </View>
  );
}

function Piece({
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
