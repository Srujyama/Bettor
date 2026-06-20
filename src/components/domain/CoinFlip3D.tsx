/**
 * CoinFlip3D — a coin that flips on the Y axis (perspective rotateX) and settles
 * showing the SERVER result face. The component animates only; the landed face
 * comes from the server. Pass `result` ('heads' | 'tails' | null) and toggle
 * `flipping`; while flipping the coin spins, then eases to the result face.
 *
 * Reduce-motion: snaps straight to the result face.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useState } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

type Face = 'heads' | 'tails';

interface Props {
  result: Face | null;
  flipping: boolean;
  /** The face the player picked, for a subtle highlight. */
  pick?: Face;
}

const SIZE = 160;

export function CoinFlip3D({ result, flipping, pick }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const rot = useSharedValue(0);

  useEffect(() => {
    if (flipping && !reduceMotion) {
      rot.value = withRepeat(withTiming(rot.value + 360, { duration: 320, easing: Easing.linear }), -1, false);
    }
  }, [flipping, reduceMotion, rot]);

  useEffect(() => {
    if (flipping || result == null) return;
    cancelAnimation(rot);
    // Heads shows at 0°, tails at 180°. Add full turns for drama, then land.
    const base = result === 'heads' ? 0 : 180;
    const turns = (Math.ceil(rot.value / 360) + 4) * 360;
    const final = turns + base;
    if (reduceMotion) {
      rot.value = base;
      return;
    }
    rot.value = withTiming(final, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [flipping, result, reduceMotion, rot]);

  // Front face (heads) visible when the rotation is "face up".
  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateX: `${rot.value}deg` }],
    backfaceVisibility: 'hidden',
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateX: `${rot.value + 180}deg` }],
    backfaceVisibility: 'hidden',
  }));

  return (
    <View className="items-center gap-2">
      <View style={{ width: SIZE, height: SIZE }}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              backgroundColor: colors.gold,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 4,
              borderColor: colors.goldDeep,
            },
            frontStyle,
          ]}
        >
          <Txt style={{ fontSize: 64 }}>👑</Txt>
          <Txt variant="label" style={{ color: colors.ink }}>
            HEADS
          </Txt>
        </Animated.View>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: SIZE,
              height: SIZE,
              borderRadius: SIZE / 2,
              backgroundColor: colors.royal,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 4,
              borderColor: colors.royalDeep,
            },
            backStyle,
          ]}
        >
          <Txt style={{ fontSize: 64 }}>🪙</Txt>
          <Txt variant="label" style={{ color: colors.text }}>
            TAILS
          </Txt>
        </Animated.View>
      </View>
      {pick ? (
        <Txt variant="caption" muted>
          You picked {pick}
        </Txt>
      ) : null}
    </View>
  );
}
