/**
 * Responsible-gaming reality check. Surfaces session duration ("You've been
 * playing for N minutes"), a quick activity summary (today's stake / bet count
 * from the user doc's rgState), and two paths: take a break (self-exclude for a
 * chosen window via fns.setRgLimits) or keep playing (records the check via
 * useUi.noteRealityCheck and dismisses). Reads session timing from useUi.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, Pill, Screen, Txt } from '@/components/ui';
import { StatBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useUi } from '@/stores/ui';
import { useCurrentUser } from '@/hooks/data';
import { useRealityCheck, useSetRgLimits } from '@/features/social/hooks';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const BREAK_OPTIONS: { label: string; ms: number }[] = [
  { label: 'Take an hour', ms: 60 * 60 * 1000 },
  { label: 'Rest of today', ms: 24 * 60 * 60 * 1000 },
  { label: 'One week', ms: 7 * 24 * 60 * 60 * 1000 },
];

export default function RealityCheckModal() {
  const router = useRouter();
  const noteRealityCheck = useUi((s) => s.noteRealityCheck);
  const { data: user } = useCurrentUser();
  const setRgLimits = useSetRgLimits();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { sessionMinutes, reminderMins } = useRealityCheck(now);
  const todayStaked = user?.rgState?.todayStaked ?? 0;
  const todayBets = user?.rgState?.todayBetCount ?? 0;
  const weekStaked = user?.rgState?.weekStaked ?? 0;

  const keepPlaying = () => {
    noteRealityCheck();
    router.back();
  };

  const takeBreak = (ms: number) => {
    setRgLimits.mutate(
      { selfExcludeForMs: ms },
      {
        onSuccess: () => {
          noteRealityCheck();
          router.back();
        },
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Reality check', presentation: 'modal' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Card raised className="items-center gap-2 py-7">
          <Txt style={{ fontSize: 44 }}>⏱️</Txt>
          <Txt variant="title" className="text-center">
            You've been playing for {sessionMinutes} {sessionMinutes === 1 ? 'minute' : 'minutes'}
          </Txt>
          <Txt variant="caption" dim className="text-center">
            We check in every {reminderMins} minutes so play stays fun.
          </Txt>
        </Card>

        {/* Activity summary */}
        <View className="gap-2">
          <Txt variant="label" dim className="px-1 uppercase tracking-wide">
            Today so far
          </Txt>
          <View className="flex-row gap-2">
            <StatBadge label="Bets joined" value={todayBets} />
            <StatBadge label="Staked today" value={formatChips(todayStaked)} tone="royal" />
          </View>
          <View className="flex-row items-center gap-2 px-1">
            <Pill label={`This week: ${formatChips(weekStaked)} staked`} tone="muted" />
          </View>
        </View>

        {/* Keep playing */}
        <Button label="Keep playing" tone="jade" onPress={keepPlaying} />

        {/* Take a break */}
        <Card className="gap-3 border-coral/30">
          <View className="gap-0.5">
            <Txt variant="heading">Take a break</Txt>
            <Txt variant="caption" dim>
              Pause your account. You won't be able to place bets until the break ends.
            </Txt>
          </View>
          <View className="gap-2">
            {BREAK_OPTIONS.map((opt) => (
              <Button
                key={opt.label}
                label={opt.label}
                tone="ghost"
                loading={setRgLimits.isPending}
                onPress={() => takeBreak(opt.ms)}
              />
            ))}
          </View>
        </Card>

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
