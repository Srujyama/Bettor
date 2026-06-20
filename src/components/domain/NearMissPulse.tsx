/**
 * NearMissPulse — a reusable shake/pulse wrapper for "so close" moments and
 * ready-to-claim emphasis. Wrap any node; toggle `active` to run a looping
 * scale-pulse (and an optional one-shot horizontal shake via `shake`). Respects
 * reduce-motion by rendering the child statically.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  children: React.ReactNode;
  /** Run the looping pulse. */
  active?: boolean;
  /** Fire a one-shot shake whenever this value changes (e.g. a near-miss tick). */
  shake?: number;
}

export function NearMissPulse({ children, active, shake }: Props) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion || !active) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 520, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 520, easing: Easing.in(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, [active, reduceMotion, scale]);

  useEffect(() => {
    if (reduceMotion || shake == null) return;
    tx.value = withSequence(
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(-4, { duration: 50 }),
      withTiming(4, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [shake, reduceMotion, tx]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: tx.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
