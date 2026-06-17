/**
 * Chipd Wrapped — a swipeable story of the player's period in numbers, ending on
 * a shareable card. Stats come from a server-computed Wrapped doc
 * (users/{uid}/wrapped/{periodId}); we call generateWrapped on open to (re)build
 * it. The final slide is snapshotted via react-native-view-shot and shared
 * through expo-sharing. All figures are read-only; no money is computed client-side.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { toast } from '@/lib/toast';
import { Button, Screen, Txt } from '@/components/ui';
import { WrappedSlide } from '@/components/domain';
import { colors } from '@/theme';
import { useGenerateWrapped, useWrapped } from '@/features/gamification/hooks';
import { formatChips } from '@/shared/money';
import type { Wrapped } from '@/shared/schemas-ext';

const { width } = Dimensions.get('window');

interface SlideSpec {
  kicker: string;
  headline: string;
  caption?: string;
  emoji: string;
  tone: 'jade' | 'coral' | 'gold' | 'royal' | 'ink';
}

function buildSlides(w: Wrapped): SlideSpec[] {
  const winPct = Math.round(w.winRate * 100);
  const net = `${w.netChips >= 0 ? '+' : ''}${formatChips(w.netChips)}`;
  return [
    {
      kicker: w.periodLabel,
      headline: 'Your Wrapped',
      caption: "Let's relive how it went.",
      emoji: '🎰',
      tone: 'ink',
    },
    {
      kicker: 'Bets Placed',
      headline: w.betsPlaced.toLocaleString(),
      caption: `You wagered ${formatChips(w.chipsWagered)} Chips across the period.`,
      emoji: '🎲',
      tone: 'royal',
    },
    {
      kicker: 'Win Rate',
      headline: `${winPct}%`,
      caption: `${w.betsWon.toLocaleString()} wins. ${
        winPct >= 50 ? 'Sharp.' : 'Room to run.'
      }`,
      emoji: winPct >= 50 ? '🦈' : '📈',
      tone: 'jade',
    },
    {
      kicker: 'Biggest Win',
      headline: `+${formatChips(w.biggestWin)}`,
      caption: 'Your single best payout. Worth a screenshot.',
      emoji: '💰',
      tone: 'gold',
    },
    {
      kicker: 'Longest Streak',
      headline: `${w.longestStreak}🔥`,
      caption: `Your hottest run, on ${w.favoriteCategory} bets mostly.`,
      emoji: '🔥',
      tone: 'coral',
    },
    {
      kicker: 'Net Result',
      headline: net,
      caption: w.netChips >= 0 ? 'In the green. Respect.' : 'Next period is yours.',
      emoji: w.netChips >= 0 ? '🟢' : '🔄',
      tone: w.netChips >= 0 ? 'jade' : 'coral',
    },
  ];
}

export default function WrappedScreen() {
  const insets = useSafeAreaInsets();
  const { periodId } = useLocalSearchParams<{ periodId: string }>();
  const resolvedPeriod = periodId && periodId !== 'current' ? periodId : null;
  const { data: wrapped } = useWrapped(resolvedPeriod);
  const generate = useGenerateWrapped();

  // Build/refresh the Wrapped doc on open.
  useEffect(() => {
    generate.mutate(resolvedPeriod ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedPeriod]);

  const live = wrapped ?? generate.data?.wrapped ?? null;
  const slides = useMemo(() => (live ? buildSlides(live) : []), [live]);

  const [index, setIndex] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const shareRef = useRef<View>(null);
  const onShare = async () => {
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 0.95 });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { dialogTitle: 'My Chipd Wrapped' });
      } else {
        toast({ title: 'Card saved', message: 'Sharing unavailable on this device', preset: 'done' });
      }
    } catch {
      toast({ title: "Couldn't create card", preset: 'error', haptic: 'error' });
    }
  };

  if (!live) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Wrapped', headerShown: false }} />
        <View className="flex-1 items-center justify-center gap-3">
          <Txt style={{ fontSize: 56 }}>🎰</Txt>
          <Txt variant="heading">Building your Wrapped…</Txt>
          <Txt variant="caption" muted>
            Crunching your bets, wins and streaks.
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Chipd Wrapped', headerShown: false }} />
      <View className="flex-1">
        {/* Close button — sits in the top safe-area inset so the story isn't a trap. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Wrapped"
          onPress={() => router.back()}
          hitSlop={12}
          className="absolute right-5 z-20 h-9 w-9 items-center justify-center rounded-full border border-hairline bg-surface-raised"
          style={{ top: insets.top + 16 }}
        >
          <Txt style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>✕</Txt>
        </Pressable>

        {/* Progress dots */}
        <View
          className="absolute left-0 right-0 z-10 flex-row justify-center gap-1.5 px-6"
          style={{ top: insets.top + 12 }}
          pointerEvents="none"
        >
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= index ? colors.text : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </View>

        <FlatList
          data={slides}
          keyExtractor={(_, i) => `slide-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          renderItem={({ item }) => (
            <WrappedSlide
              width={width}
              kicker={item.kicker}
              headline={item.headline}
              caption={item.caption}
              emoji={item.emoji}
              tone={item.tone}
            />
          )}
        />

        {/* Share affordance + the hidden, snapshot-ready card. */}
        <View className="absolute bottom-6 left-6 right-6 gap-3">
          <Button label="Share my Wrapped" tone="gold" onPress={onShare} />
        </View>

        {/* Offscreen capture target — a compact summary card. */}
        <View
          ref={shareRef}
          collapsable={false}
          style={{ position: 'absolute', top: -10_000, left: 0, width: 340 }}
        >
          <WrappedSlide
            width={340}
            card
            kicker={live.periodLabel}
            headline={`${live.netChips >= 0 ? '+' : ''}${formatChips(live.netChips)} Chips`}
            caption={`${live.betsPlaced} bets · ${Math.round(
              live.winRate * 100,
            )}% win rate · ${live.longestStreak}🔥 best streak`}
            emoji="🎰"
            tone={live.netChips >= 0 ? 'jade' : 'royal'}
          />
        </View>
      </View>
    </Screen>
  );
}
