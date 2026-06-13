/**
 * HoldToConfirm — a press-and-hold commit button. The deliberate friction is a
 * responsible-gaming feature: committing Chips should never be a single tap. A
 * radial ring fills while held; releasing early cancels. On completion it fires
 * onConfirm and a success haptic. Reduce-motion shrinks the fill to instant by
 * snapping the duration. Presentational: onConfirm owned by caller.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Tone = 'jade' | 'coral' | 'gold' | 'royal';

const TONE_COLOR: Record<Tone, string> = {
  jade: colors.jade,
  coral: colors.coral,
  gold: colors.gold,
  royal: colors.royal,
};

interface Props {
  label: string;
  onConfirm: () => void;
  durationMs?: number;
  tone?: Tone;
  disabled?: boolean;
  /** Diameter of the radial button. */
  size?: number;
}

export function HoldToConfirm({
  label,
  onConfirm,
  durationMs = 900,
  tone = 'jade',
  disabled,
  size = 140,
}: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useSharedValue(0);
  const color = TONE_COLOR[tone];

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const stroke = Math.max(4, size * 0.05);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - progress.value),
  }));

  const fire = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  const start = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const dur = reduceMotion ? 220 : durationMs;
    progress.value = withTiming(
      1,
      { duration: dur * (1 - progress.value), easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(fire)();
      },
    );
  };

  const cancel = () => {
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
  };

  return (
    <View className="items-center gap-2">
      <Pressable
        onPressIn={start}
        onPressOut={cancel}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityHint="Press and hold to confirm"
        style={{ width: size, height: size, opacity: disabled ? 0.5 : 1 }}
      >
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.hairline}
            strokeWidth={stroke}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circ}
            animatedProps={animatedProps}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            margin: stroke + 6,
            borderRadius: 999,
            backgroundColor: `${color}1A`,
          }}
        >
          <Txt variant="heading" style={{ color, textAlign: 'center' }}>
            {label}
          </Txt>
        </View>
      </Pressable>
      <Txt variant="caption" muted>
        Hold to confirm
      </Txt>
    </View>
  );
}
