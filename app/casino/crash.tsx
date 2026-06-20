/**
 * Crash — set a cashout target multiplier, then play. The multiplier curve rises
 * and the SERVER decides the crash point: if your target was reached before the
 * crash you win stake×target, otherwise you bust. The client animates the climb
 * to the server's crash point and colors it by the outcome. All money is
 * server-side; `params.cashoutMultiplier` drives the server's resolveCrash.
 */
import { useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { Screen, Txt } from '@/components/ui';
import { CrashGraph, GameStakeBar, BigWinOverlay, ProvablyFairBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useWallet } from '@/hooks/data';
import { usePlayGame } from '@/features/casino/hooks';
import type { PlayGameResult } from '@/lib/firebase/functions';
import { makeId } from '@/shared/ids';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const TARGETS = [1.25, 1.5, 2, 3, 5, 10] as const;

interface WalletView {
  chipsBalance?: number;
}

export default function CrashScreen() {
  const { data: wallet } = useWallet();
  const balance = (wallet as WalletView | undefined)?.chipsBalance ?? 0;
  const play = usePlayGame();

  const [stake, setStake] = useState<number>(STAKE.MIN);
  const [cashout, setCashout] = useState<number>(2);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<PlayGameResult | null>(null);
  const [showWin, setShowWin] = useState(false);

  const crashAt = (last?.result?.crashAt as number | undefined) ?? null;
  const won = (last?.result?.won as boolean | undefined) ?? null;

  const launch = () => {
    if (running || play.isPending) return;
    setRunning(true);
    setShowWin(false);
    setLast(null);
    play.mutate(
      { game: 'crash', stake, clientSeed: makeId(), params: { cashoutMultiplier: cashout } },
      {
        onSuccess: (res) => {
          // Let the curve climb a beat, then reveal the crash point.
          setTimeout(() => {
            setLast(res);
            setRunning(false);
            if (res.payout > 0) setTimeout(() => setShowWin(true), 1000);
          }, 1400);
        },
        onError: () => setRunning(false),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Crash' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <CrashGraph
          cashoutTarget={cashout}
          crashAt={running ? null : crashAt}
          won={running ? null : won}
          running={running}
        />

        {/* Cashout target picker */}
        <View className="gap-2">
          <Txt variant="caption" muted className="uppercase tracking-widest px-1">
            Auto cash-out at
          </Txt>
          <View className="flex-row flex-wrap gap-2">
            {TARGETS.map((t) => {
              const active = t === cashout;
              return (
                <Pressable
                  key={t}
                  disabled={running || play.isPending}
                  onPress={() => setCashout(t)}
                  className={`rounded-pill border px-3 py-1.5 ${
                    active ? 'border-jade/60 bg-jade/20' : 'border-hairline bg-white/5'
                  }`}
                >
                  <Txt
                    variant="label"
                    className="font-semibold"
                    style={{ color: active ? colors.jade : colors.textDim }}
                  >
                    {t}×
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        </View>

        <GameStakeBar
          stake={stake}
          onStakeChange={setStake}
          balance={balance}
          onPlay={launch}
          playLabel={`LAUNCH · CASH OUT ${cashout}×`}
          busy={running || play.isPending}
          tone="jade"
        />

        <ProvablyFairBadge
          serverSeedHash={last?.serverSeedHash}
          serverSeed={last?.serverSeed}
          clientSeed={last?.clientSeed}
          nonce={last?.nonce}
        />

        <Txt variant="caption" muted className="px-1">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>

      <BigWinOverlay
        visible={showWin}
        payout={last?.payout ?? 0}
        multiplier={last?.multiplier ?? 0}
        onDismiss={() => setShowWin(false)}
      />
    </Screen>
  );
}
