/**
 * BigWinOverlay — a local, prop-driven win flourish for the casino games (the
 * global WinCelebration reads the shared store; this one is controlled by the
 * game screen so a slots/wheel/crash win can fire it independently). Shows the
 * multiplier + payout with a gold burst and a short confetti spray. Auto-dismiss
 * after a few seconds. Reduce-motion fades a static panel instead.
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
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';

const CONFETTI_COLORS = [colors.gold, colors.jade, colors.coral, colors.royal];
const PIECE_COUNT = 24;
const AUTO_DISMISS_MS = 3800;

interface Props {
  visible: boolean;
  payout: number;
  multiplier: number;
  onDismiss: () => void;
}

export function BigWinOverlay({ visible, payout, multiplier, onDismiss }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!reduceMotion) {
      scale.value = withSequence(
        withSpring(1.08, { damping: 8 }),
        withSpring(1, { damping: 12 }),
      );
    } else {
      scale.value = 1;
    }
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [visible, reduceMotion, onDismiss, scale]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(220)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(10,11,15,0.85)',
      }}
    >
      <LinearGradient
        colors={[`${colors.gold}30`, 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '70%' }}
      />

      {!reduceMotion ? <Confetti /> : null}

      <Pressable
        onPress={onDismiss}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <Animated.View style={panelStyle} className="items-center gap-2 px-8">
        <Txt style={{ fontSize: 52 }}>🎰</Txt>
        <Txt variant="title" style={{ color: colors.gold }}>
          BIG WIN · {multiplier}×
        </Txt>
        <ChipCounter value={payout} size={52} color={colors.gold} prefix="+" />
        <Txt variant="caption" muted className="pt-1 text-center">
          Chips have no real-world cash value.
        </Txt>
        <Txt variant="caption" muted className="pt-2">
          Tap to dismiss
        </Txt>
      </Animated.View>
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
        delay: Math.random() * 350,
        duration: 1500 + Math.random() * 1300,
        drift: (Math.random() - 0.5) * 90,
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
