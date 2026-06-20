/**
 * Rewards hub — the daily/hourly habit loop in one screen:
 *   • HourlyDropTimer  — live FOMO countdown + big CLAIM + streak flames
 *   • DailySpinDial    — once-a-day free wheel
 *   • RewardChest / ChestOpen — variable-reward loot box
 *   • StreakMeter      — consecutive-day progress toward the next milestone
 *
 * All money is read-only here. Claims/opens/spins go through the engagement
 * feature hooks → callables; the server-written balance + engagement state flow
 * back via the live read hooks. Compliance: Chips have no real-world cash value.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { ChipCounter, Screen, Txt } from '@/components/ui';
import {
  ChestOpen,
  DailySpinDial,
  FomoBadge,
  HourlyDropTimer,
  RewardChest,
  StreakMeter,
} from '@/components/domain';
import { colors } from '@/theme';
import { useCurrentUser, useWallet } from '@/hooks/data';
import {
  dailySpinReadyIn,
  useClaimHourlyDrop,
  useDailySpin,
  useOpenChest,
  useRecordActivity,
} from '@/features/engagement/hooks';
import type { ChestTier, EngagementState } from '@/shared';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

/** Engagement denorm fields the CFs write onto the user doc. */
interface EngagementUserView {
  chipsBalance?: number;
  engagement?: Partial<EngagementState> | null;
  lastChestFreeAt?: number | null;
}

function fmtRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function RewardsScreen() {
  const { data: userDoc } = useCurrentUser();
  const { data: walletDoc } = useWallet();
  const user = (userDoc ?? {}) as EngagementUserView;
  const wallet = (walletDoc ?? {}) as EngagementUserView;
  const engagement = user.engagement ?? {};
  const balance = wallet.chipsBalance ?? user.chipsBalance ?? 0;

  const claimDrop = useClaimHourlyDrop();
  const spin = useDailySpin();
  const openChest = useOpenChest();
  const recordActivity = useRecordActivity();

  // Ping activity once on mount to advance the day-streak meter.
  const recordMutate = recordActivity.mutate;
  useEffect(() => {
    recordMutate();
  }, [recordMutate]);

  // Live clock for the daily-spin cooldown copy.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const spinReadyIn = dailySpinReadyIn(engagement.lastDailySpinAt ?? null, now);
  const spinReady = spinReadyIn <= 0;

  // Chest reveal: surface the server's resolved reward to <ChestOpen/>.
  const chestReward = useMemo<{ tier: ChestTier; chips: number } | null>(() => {
    const d = openChest.data;
    return d ? { tier: d.tier, chips: d.chips } : null;
  }, [openChest.data]);
  const [revealing, setRevealing] = useState(false);

  const dayStreak = engagement.dayStreak ?? 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Rewards' }} />

      <View className="flex-row items-center justify-between px-4 pt-2">
        <View className="flex-row items-center gap-2">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Your balance
          </Txt>
          <FomoBadge level="warm" label="streak live" />
        </View>
        <ChipCounter value={balance} size={22} color={colors.gold} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}>
        {/* Hourly drop — the headline FOMO loop. */}
        <HourlyDropTimer
          engagement={engagement}
          onClaim={() => claimDrop.mutate()}
          claiming={claimDrop.isPending}
        />

        {/* Day-streak meter. */}
        <StreakMeter streak={dayStreak} />

        {/* Daily spin. */}
        <View className="gap-2">
          <Txt variant="caption" muted className="uppercase tracking-widest px-1">
            Daily spin
          </Txt>
          <DailySpinDial
            prizeIndex={spin.data?.prizeIndex ?? spin.data?.segmentIndex ?? null}
            spinning={spin.isPending}
            ready={spinReady}
            readyLabel={spinReady ? undefined : fmtRemaining(spinReadyIn)}
            onSpin={() => spin.mutate()}
          />
        </View>

        {/* Chest — resting tile + open/reveal. */}
        <View className="gap-2">
          <Txt variant="caption" muted className="uppercase tracking-widest px-1">
            Mystery chest
          </Txt>
          {revealing && chestReward ? (
            <ChestOpen
              reward={chestReward}
              opening={openChest.isPending}
              onOpen={() => setRevealing(false)}
            />
          ) : (
            <RewardChest
              nextFreeAt={
                openChest.data?.nextFreeAt ??
                (user.lastChestFreeAt != null ? user.lastChestFreeAt + 4 * 60 * 60 * 1000 : null)
              }
              paidCost={75}
              chestsOpened={engagement.chestsOpened ?? 0}
              opening={openChest.isPending}
              onOpen={() => {
                setRevealing(true);
                openChest.mutate();
              }}
            />
          )}
        </View>

        <Txt variant="caption" muted className="px-1">
          Come back every hour to grow your streak. {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
