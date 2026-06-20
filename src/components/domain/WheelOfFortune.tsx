/**
 * WheelOfFortune — an SVG prize wheel that decelerates onto the SERVER-chosen
 * segment. The component animates only; the winning segment comes from the
 * server result. Pass `targetIndex` (+ optional finer `targetRotation` in [0,1])
 * and toggle `spinning`; when spinning flips false with a target set, the wheel
 * eases to rest with the pointer over that segment after several full turns.
 *
 * Reduce-motion: snaps to the target with no spin.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useState } from 'react';
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { WHEEL_SEGMENTS } from '@/shared/casino';

const SIZE = 280;
const R = SIZE / 2;
const SEG = WHEEL_SEGMENTS.length;
const SEG_ANGLE = 360 / SEG;

const SEGMENT_COLORS = [
  colors.surfaceRaised,
  colors.royalDeep,
  colors.jadeDeep,
  colors.coralDeep,
  colors.royal,
  colors.jade,
  colors.gold,
];

function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function wedgePath(i: number): string {
  const start = i * SEG_ANGLE;
  const end = start + SEG_ANGLE;
  const p1 = polar(R, R, R - 6, start);
  const p2 = polar(R, R, R - 6, end);
  const large = SEG_ANGLE > 180 ? 1 : 0;
  return `M ${R} ${R} L ${p1.x} ${p1.y} A ${R - 6} ${R - 6} 0 ${large} 1 ${p2.x} ${p2.y} Z`;
}

interface Props {
  targetIndex: number | null;
  /** Finer resting fraction within the segment, 0..1 (from the server result). */
  targetRotation?: number | null;
  spinning: boolean;
}

export function WheelOfFortune({ targetIndex, targetRotation, spinning }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const rotation = useSharedValue(0);

  // While spinning (no target yet), keep accelerating turns.
  useEffect(() => {
    if (spinning && !reduceMotion) {
      rotation.value = withTiming(rotation.value + 1440, {
        duration: 1400,
        easing: Easing.linear,
      });
    }
  }, [spinning, reduceMotion, rotation]);

  // Settle: bring the chosen segment under the top pointer.
  useEffect(() => {
    if (spinning || targetIndex == null) return;
    const within = targetRotation != null ? (targetRotation % 1) : 0.5;
    // Angle from the wheel's 0 to the center of the chosen segment.
    const segCenter = targetIndex * SEG_ANGLE + within * SEG_ANGLE;
    // To put that under the top pointer (12 o'clock), rotate by -segCenter, plus
    // a few full turns for drama, landing on a normalized multiple.
    const current = rotation.value;
    const turns = Math.ceil(current / 360) + 5;
    const final = turns * 360 - segCenter;
    if (reduceMotion) {
      rotation.value = -segCenter;
      return;
    }
    rotation.value = withTiming(final, { duration: 3200, easing: Easing.out(Easing.cubic) });
  }, [spinning, targetIndex, targetRotation, reduceMotion, rotation]);

  const wheelStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <View className="items-center">
      <View style={{ width: SIZE, height: SIZE }}>
        <Animated.View style={[{ width: SIZE, height: SIZE }, wheelStyle]}>
          <Svg width={SIZE} height={SIZE}>
            <Circle cx={R} cy={R} r={R - 2} fill={colors.ink} />
            <G>
              {WHEEL_SEGMENTS.map((seg, i) => {
                const mid = i * SEG_ANGLE + SEG_ANGLE / 2;
                const label = polar(R, R, R * 0.62, mid);
                return (
                  <G key={i}>
                    <Path d={wedgePath(i)} fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} stroke={colors.ink} strokeWidth={2} />
                    <SvgText
                      x={label.x}
                      y={label.y}
                      fill={colors.text}
                      fontSize={15}
                      fontWeight="700"
                      textAnchor="middle"
                      transform={`rotate(${mid} ${label.x} ${label.y})`}
                    >
                      {seg.label}
                    </SvgText>
                  </G>
                );
              })}
            </G>
            <Circle cx={R} cy={R} r={26} fill={colors.surface} stroke={colors.gold} strokeWidth={2} />
          </Svg>
        </Animated.View>

        {/* Fixed top pointer. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -4,
            left: R - 10,
            width: 0,
            height: 0,
            borderLeftWidth: 10,
            borderRightWidth: 10,
            borderTopWidth: 20,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: colors.gold,
          }}
        />
      </View>
      <Txt variant="caption" muted className="pt-2">
        Spin to land a multiplier
      </Txt>
    </View>
  );
}
