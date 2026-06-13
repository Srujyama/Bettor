/**
 * Rolling tabular-figure Chip counter — the hero numeral. Animates between
 * values so a balance change or a growing pot feels physical. Respects
 * reduce-motion by snapping instantly.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useState } from 'react';
import { formatChips } from '@/shared/money';
import { colors } from '@/theme';

const AnimatedText = Animated.createAnimatedComponent(Text);

interface Props {
  value: number;
  size?: number;
  color?: string;
  prefix?: string;
  className?: string;
}

export function ChipCounter({ value, size = 40, color = colors.text, prefix = '' }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const animated = useSharedValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      animated.value = value;
      return;
    }
    animated.value = withTiming(value, { duration: 650 });
    // Drive the JS-side formatted display via a lightweight interval.
    const from = display;
    const to = value;
    const start = Date.now();
    const dur = 650;
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text
        style={{
          fontSize: size,
          color,
          fontVariant: ['tabular-nums'],
          fontWeight: '800',
          letterSpacing: -1,
        }}
      >
        {prefix}
        {formatChips(display)}
      </Text>
    </View>
  );
}
