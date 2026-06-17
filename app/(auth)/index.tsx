/**
 * Welcome screen — the front door. Chipd wordmark, a small auto-advancing value
 * carousel, and the auth entry points. Email is the first-class path for the
 * pilot; Google/Apple are present but flagged "coming soon". Compliance microcopy
 * (18+, no cash value) lives at the bottom where the law expects it.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { toast } from '@/lib/toast';
import { Screen, Txt, Button } from '@/components/ui';
import { colors, gradients } from '@/theme';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface Slide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: '🤝',
    title: 'Bet your friends, not the house',
    body: 'Settle the group-chat arguments for real. Pick a side, stake your Chips, winner takes the pot.',
  },
  {
    emoji: '🎲',
    title: 'On literally anything',
    body: 'Sports, weather, who pays for dinner. If you can call it, you can bet on it.',
  },
  {
    emoji: '🏆',
    title: 'Climb the table',
    body: 'Free Chips daily, streaks, and a leaderboard that says exactly who runs the group.',
  },
];

export default function Welcome() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Auto-advance the carousel (paused under reduce-motion).
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % SLIDES.length;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(id);
  }, [reduceMotion, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  const comingSoon = (provider: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    toast({
      title: `${provider} sign-in is coming soon`,
      message: 'For now, continue with your email — it only takes a moment.',
      preset: 'none',
      haptic: 'warning',
    });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        {/* Wordmark */}
        <View className="items-center pt-10">
          <View className="flex-row items-baseline gap-1">
            <Txt variant="display" style={{ color: colors.text }}>
              Chipd
            </Txt>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.jade,
                marginBottom: 8,
              }}
            />
          </View>
          <Txt variant="caption" muted className="mt-1 tracking-widest uppercase">
            The members' card room
          </Txt>
        </View>

        {/* Value carousel */}
        <View className="flex-1 justify-center">
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            scrollEventThrottle={16}
          >
            {SLIDES.map((s) => (
              <View key={s.title} style={{ width }} className="items-center px-8">
                <Txt style={{ fontSize: 72 }}>{s.emoji}</Txt>
                <Txt variant="title" className="mt-6 text-center">
                  {s.title}
                </Txt>
                <Txt variant="body" dim className="mt-3 text-center leading-6">
                  {s.body}
                </Txt>
              </View>
            ))}
          </ScrollView>

          {/* Dots */}
          <View className="mt-8 flex-row justify-center gap-2">
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? 22 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === index ? colors.jade : colors.surfaceRaised,
                }}
              />
            ))}
          </View>
        </View>

        {/* Auth actions */}
        <View className="gap-3 pb-2">
          <Button
            label="Continue with Email"
            tone="jade"
            size="lg"
            onPress={() => router.push('/(auth)/email')}
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button label="Google" tone="ghost" onPress={() => comingSoon('Google')} />
            </View>
            <View className="flex-1">
              <Button label="Apple" tone="ghost" onPress={() => comingSoon('Apple')} />
            </View>
          </View>

          <Button
            label="Use a phone number instead"
            tone="ghost"
            size="sm"
            haptic={false}
            onPress={() => router.push('/(auth)/phone')}
          />
        </View>

        {/* Compliance microcopy */}
        <LinearGradient
          colors={['transparent', gradients.ink[1]]}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 }}
        />
        <View className="items-center gap-1 pb-4 pt-3">
          <Txt variant="caption" muted className="text-center">
            18+ only. You must be of legal age to play.
          </Txt>
          <Txt variant="caption" muted className="text-center">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </View>
      </View>
    </Screen>
  );
}
