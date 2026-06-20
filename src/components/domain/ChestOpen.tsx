/**
 * ChestOpen — the variable-reward "loot box" moment. A tappable chest that, on
 * open, plays a Reanimated wobble → burst → reward reveal (tier color + Chip
 * amount). The PARENT calls the openChest callable and feeds the resolved
 * { tier, chips } back via `reward`; this component owns only the animation +
 * reveal. Reduce-motion reveals instantly. Compliance: Chips have no cash value.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Txt, ChipCounter } from '@/components/ui';
import { colors } from '@/theme';
import type { ChestTier } from '@/shared';

const TIER_COLOR: Record<ChestTier, string> = {
  common: colors.textDim,
  rare: colors.royal,
  epic: colors.gold,
  legendary: colors.coral,
};

interface Props {
  /** Null until the server resolves the open; setting it triggers the reveal. */
  reward: { tier: ChestTier; chips: number } | null;
  /** Open is in flight (server round-trip). */
  opening?: boolean;
  /** Tap the chest to open. */
  onOpen: () => void;
}

export function ChestOpen({ reward, opening, onOpen }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const wobble = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Idle / opening wobble.
  useEffect(() => {
    if (reduceMotion) return;
    if (opening) {
      wobble.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: 90 }),
          withTiming(1, { duration: 90 }),
        ),
        -1,
        true,
      );
    } else {
      wobble.value = withTiming(0, { duration: 120 });
    }
  }, [opening, reduceMotion, wobble]);

  // Reveal pop when the reward lands.
  useEffect(() => {
    if (!reward) {
      pop.value = 0;
      return;
    }
    pop.value = reduceMotion
      ? 1
      : withDelay(80, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(2)) }));
  }, [reward, reduceMotion, pop]);

  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wobble.value * 8}deg` }],
  }));
  const rewardStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + pop.value * 0.4 }],
  }));

  const tierColor = reward ? TIER_COLOR[reward.tier] : colors.gold;

  return (
    <View className="items-center gap-4 rounded-card border border-gold/30 bg-surface p-6">
      {reward ? (
        <Animated.View style={rewardStyle} className="items-center gap-2">
          <Txt style={{ fontSize: 56 }}>{reward.tier === 'legendary' ? '👑' : '🎁'}</Txt>
          <Txt variant="heading" style={{ color: tierColor }} className="uppercase tracking-widest">
            {reward.tier}
          </Txt>
          <ChipCounter value={reward.chips} size={40} color={colors.gold} prefix="+" />
        </Animated.View>
      ) : (
        <Pressable onPress={onOpen} disabled={opening} hitSlop={12}>
          <Animated.View style={lidStyle}>
            <Txt style={{ fontSize: 72 }}>🧰</Txt>
          </Animated.View>
        </Pressable>
      )}

      {!reward ? (
        <Animated.View entering={FadeIn}>
          <Txt variant="caption" muted className="text-center">
            {opening ? 'Opening…' : 'Tap to open'}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}
