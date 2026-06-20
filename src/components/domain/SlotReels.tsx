/**
 * SlotReels — three vertically-scrolling slot reels that spin while a round is in
 * flight and SETTLE onto the server's authoritative symbols. The component owns
 * only the animation; it never decides the outcome. Drive it by passing the
 * `target` indices (from the server result) and toggling `spinning`. On a
 * near-miss the reels do a small shake.
 *
 * Reduce-motion: skips the scroll and snaps straight to the target symbols.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { useState } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { SLOT_SYMBOLS } from '@/shared/casino';

const ROW_H = 84;
/** A repeated strip so the reel can scroll continuously while spinning. */
const STRIP = [...SLOT_SYMBOLS, ...SLOT_SYMBOLS, ...SLOT_SYMBOLS, ...SLOT_SYMBOLS];

interface Props {
  /** Server-resolved symbol indices (0..SLOT_SYMBOLS.length-1) for the 3 reels. */
  target: [number, number, number] | null;
  spinning: boolean;
  nearMiss?: boolean;
}

export function SlotReels({ target, spinning, nearMiss }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  return (
    <View
      className="flex-row justify-center gap-2 rounded-card border border-hairline bg-surface-sunken p-3"
      style={{ overflow: 'hidden' }}
    >
      {[0, 1, 2].map((i) => (
        <Reel
          key={i}
          index={i}
          target={target ? target[i] : null}
          spinning={spinning}
          reduceMotion={reduceMotion}
          nearMiss={!!nearMiss}
        />
      ))}
    </View>
  );
}

function Reel({
  index,
  target,
  spinning,
  reduceMotion,
  nearMiss,
}: {
  index: number;
  target: number | null;
  spinning: boolean;
  reduceMotion: boolean;
  nearMiss: boolean;
}) {
  const y = useSharedValue(0);
  const shake = useSharedValue(0);

  // Continuous spin while `spinning`.
  useEffect(() => {
    if (spinning && !reduceMotion) {
      y.value = 0;
      y.value = withRepeat(
        withTiming(-ROW_H * SLOT_SYMBOLS.length, {
          duration: 360,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    }
    return () => {
      // no-op; settle effect cancels.
    };
  }, [spinning, reduceMotion, y]);

  // Settle onto the target with a staggered, decelerating stop per reel.
  useEffect(() => {
    if (spinning || target == null) return;
    cancelAnimation(y);
    const land = -ROW_H * (SLOT_SYMBOLS.length + target); // land in the middle copy
    if (reduceMotion) {
      y.value = land;
      return;
    }
    y.value = withDelay(
      index * 220,
      withTiming(land, { duration: 520, easing: Easing.out(Easing.cubic) }),
    );
  }, [spinning, target, index, reduceMotion, y]);

  // Near-miss shake once the reels have settled.
  useEffect(() => {
    if (spinning || !nearMiss || reduceMotion) return;
    shake.value = withDelay(
      700,
      withSequence(
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(-4, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      ),
    );
  }, [spinning, nearMiss, reduceMotion, shake]);

  const stripStyle = useAnimatedStyle(() => {
    // Wrap the continuous-spin offset into the strip height so it loops cleanly.
    const wrapped = ((y.value % (ROW_H * STRIP.length)) + ROW_H * STRIP.length) % (ROW_H * STRIP.length);
    return { transform: [{ translateY: -wrapped }, { translateX: shake.value }] };
  });

  return (
    <View
      className="rounded-chip border border-hairline bg-ink"
      style={{ width: 80, height: ROW_H, overflow: 'hidden' }}
    >
      <Animated.View style={stripStyle}>
        {STRIP.map((sym, i) => (
          <View key={i} style={{ height: ROW_H, alignItems: 'center', justifyContent: 'center' }}>
            <Txt style={{ fontSize: 44 }}>{sym}</Txt>
          </View>
        ))}
      </Animated.View>
      {/* Center line accent. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: ROW_H / 2 - 1,
          height: 2,
          backgroundColor: colors.gold + '40',
        }}
      />
    </View>
  );
}
