/**
 * Wheel of Fortune — a spinning SVG wheel that decelerates onto the SERVER
 * segment. Client animates only; the winning segment + multiplier come from the
 * server result. BigWinOverlay fires on a chunky multiplier.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Screen, Txt } from '@/components/ui';
import { WheelOfFortune, GameStakeBar, BigWinOverlay, ProvablyFairBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useWallet } from '@/hooks/data';
import { usePlayGame } from '@/features/casino/hooks';
import type { PlayGameResult } from '@/lib/firebase/functions';
import { makeId } from '@/shared/ids';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface WalletView {
  chipsBalance?: number;
}

export default function WheelScreen() {
  const { data: wallet } = useWallet();
  const balance = (wallet as WalletView | undefined)?.chipsBalance ?? 0;
  const play = usePlayGame();

  const [stake, setStake] = useState<number>(STAKE.MIN);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<PlayGameResult | null>(null);
  const [showWin, setShowWin] = useState(false);

  const segmentIndex = (last?.result?.segmentIndex as number | undefined) ?? null;
  const rotation = (last?.result?.rotation as number | undefined) ?? null;

  const spin = () => {
    if (spinning || play.isPending) return;
    setSpinning(true);
    setShowWin(false);
    play.mutate(
      { game: 'wheel', stake, clientSeed: makeId() },
      {
        onSuccess: (res) => {
          setLast(res);
          // Brief free spin, then settle (the wheel eases over ~3.2s).
          setTimeout(() => {
            setSpinning(false);
            if (res.payout > 0) setTimeout(() => setShowWin(true), 3400);
          }, 600);
        },
        onError: () => setSpinning(false),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Wheel of Fortune' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <WheelOfFortune
          targetIndex={spinning ? null : segmentIndex}
          targetRotation={rotation}
          spinning={spinning}
        />

        {last && !spinning ? (
          <View className="items-center">
            <Txt variant="heading" style={{ color: last.payout > 0 ? colors.jade : colors.textDim }}>
              {last.payout > 0 ? `Won ${last.payout} Chips (${last.multiplier}×)` : 'Landed 0× — spin again'}
            </Txt>
          </View>
        ) : null}

        <GameStakeBar
          stake={stake}
          onStakeChange={setStake}
          balance={balance}
          onPlay={spin}
          playLabel="SPIN THE WHEEL"
          busy={spinning || play.isPending}
          tone="royal"
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
