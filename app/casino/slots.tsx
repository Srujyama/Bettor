/**
 * Slots — three animated reels that spin while the `playGame` callable runs, then
 * settle onto the SERVER's authoritative symbols. The client never decides the
 * outcome; it animates to the result and surfaces a BigWinOverlay on a win + a
 * near-miss shake when the server flags one. All money is server-side.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Screen, Txt } from '@/components/ui';
import { SlotReels, GameStakeBar, BigWinOverlay, ProvablyFairBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useWallet } from '@/hooks/data';
import { usePlayGame } from '@/features/casino/hooks';
import type { PlayGameResult } from '@/lib/firebase/functions';
import { makeId } from '@/shared/ids';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface WalletView {
  chipsBalance?: number;
}

export default function SlotsScreen() {
  const { data: wallet } = useWallet();
  const balance = (wallet as WalletView | undefined)?.chipsBalance ?? 0;
  const play = usePlayGame();

  const [stake, setStake] = useState<number>(STAKE.MIN);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<PlayGameResult | null>(null);
  const [showWin, setShowWin] = useState(false);

  const target = (last?.result?.indices as [number, number, number] | undefined) ?? null;
  const nearMiss = (last?.result?.nearMiss as boolean | undefined) ?? false;

  const spin = () => {
    if (spinning || play.isPending) return;
    setSpinning(true);
    setShowWin(false);
    play.mutate(
      { game: 'slots', stake, clientSeed: makeId() },
      {
        onSuccess: (res) => {
          setLast(res);
          // Let the reels visibly spin briefly before settling to the result.
          setTimeout(() => {
            setSpinning(false);
            if (res.payout > 0) setTimeout(() => setShowWin(true), 1100);
          }, 700);
        },
        onError: () => setSpinning(false),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Slots' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <SlotReels target={spinning ? null : target} spinning={spinning} nearMiss={nearMiss} />

        {last && !spinning ? (
          <View className="items-center">
            <Txt
              variant="heading"
              style={{ color: last.payout > 0 ? colors.jade : colors.textDim }}
            >
              {last.payout > 0 ? `Won ${last.payout} Chips (${last.multiplier}×)` : nearMiss ? 'So close!' : 'No match — try again'}
            </Txt>
          </View>
        ) : null}

        <GameStakeBar
          stake={stake}
          onStakeChange={setStake}
          balance={balance}
          onPlay={spin}
          playLabel="SPIN"
          busy={spinning || play.isPending}
          tone="gold"
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
