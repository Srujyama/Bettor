/**
 * FeedWinCard — a celebratory full-screen highlight for a big win (a settled bet
 * payout or a casino game win). A gold radial glow, the winner's avatar + name,
 * the won amount in a big ChipCounter, and Share / "Get in" actions. Respects
 * reduce-motion (the glow is a static gradient; no looping animation).
 */
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Avatar, Button, ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import type { DiscoveryItem } from '@/shared/schemas-markets';

interface Props {
  item: DiscoveryItem;
  onShare: (item: DiscoveryItem) => void;
  onGetIn: (item: DiscoveryItem) => void;
}

export function FeedWinCard({ item, onShare, onGetIn }: Props) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      pulse.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
    });
    return () => {
      cancelled = true;
    };
  }, [pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.value * 0.25,
    transform: [{ scale: 0.96 + pulse.value * 0.08 }],
  }));

  const isGame = item.kind === 'game_win';
  const headline = isGame ? 'Casino win' : 'Big win';

  return (
    <View className="flex-1 items-center justify-center px-6 py-10">
      {/* Glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: 360, height: 360, borderRadius: 180 },
          glowStyle,
        ]}
      >
        <LinearGradient
          colors={[colors.goldDim, 'transparent']}
          style={{ flex: 1, borderRadius: 180 }}
        />
      </Animated.View>

      <Txt variant="caption" className="text-gold uppercase tracking-widest">
        🎉 {headline}
      </Txt>

      <View className="mt-6 items-center gap-3">
        <Avatar uri={item.actorPhotoURL ?? null} name={item.actorName} size={72} ring />
        <Txt variant="title" numberOfLines={1}>
          {item.actorName ?? 'A player'}
        </Txt>
        <Txt variant="body" dim numberOfLines={2} className="text-center">
          {item.title}
        </Txt>
      </View>

      <View className="my-8 items-center">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Won
        </Txt>
        <ChipCounter value={item.amount ?? 0} size={56} color={colors.gold} prefix="+" />
      </View>

      <View className="w-full flex-row gap-3">
        <View className="flex-1">
          <Button label="Share" tone="gold" size="lg" onPress={() => onShare(item)} />
        </View>
        <View className="flex-1">
          <Button label="Get in" tone="ghost" size="lg" onPress={() => onGetIn(item)} />
        </View>
      </View>

      <Txt variant="caption" muted className="mt-6 text-center">
        {NO_CASH_VALUE_DISCLOSURE}
      </Txt>
    </View>
  );
}
