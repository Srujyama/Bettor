/**
 * Scratch Card — buy a card (the wager), then scratch a 3×3 grid to reveal the
 * SERVER cells. A win is three matching non-zero values; the server already
 * computed the multiplier, so we just reveal its cells and highlight the trio.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Screen, Txt } from '@/components/ui';
import { ScratchCard, GameStakeBar, BigWinOverlay, ProvablyFairBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useWallet } from '@/hooks/data';
import { usePlayGame } from '@/features/casino/hooks';
import type { PlayGameResult } from '@/lib/firebase/functions';
import { makeId } from '@/shared/ids';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface WalletView {
  chipsBalance?: number;
}

export default function ScratchScreen() {
  const { data: wallet } = useWallet();
  const balance = (wallet as WalletView | undefined)?.chipsBalance ?? 0;
  const play = usePlayGame();

  const [stake, setStake] = useState<number>(STAKE.MIN);
  const [last, setLast] = useState<PlayGameResult | null>(null);
  const [showWin, setShowWin] = useState(false);

  const cells = (last?.result?.cells as number[] | undefined) ?? null;
  const buying = play.isPending;

  const buyCard = () => {
    if (buying) return;
    setShowWin(false);
    setLast(null);
    play.mutate(
      { game: 'scratch', stake, clientSeed: makeId() },
      {
        onSuccess: (res) => setLast(res),
      },
    );
  };

  const onAllRevealed = () => {
    if (last && last.payout > 0) setShowWin(true);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Scratch Card' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {cells ? (
          <View className="gap-3">
            <ScratchCard
              cells={cells}
              multiplier={last?.multiplier ?? 0}
              onAllRevealed={onAllRevealed}
            />
            <View className="items-center">
              <Txt variant="heading" style={{ color: (last?.payout ?? 0) > 0 ? colors.jade : colors.textDim }}>
                {(last?.payout ?? 0) > 0
                  ? `Won ${last?.payout} Chips (${last?.multiplier}×)`
                  : 'No three-match — buy another'}
              </Txt>
            </View>
            <Button label="New card" tone="ghost" onPress={buyCard} loading={buying} />
          </View>
        ) : (
          <View className="items-center gap-3 rounded-card border border-hairline bg-surface p-8">
            <Txt style={{ fontSize: 52 }}>🎟️</Txt>
            <Txt variant="heading">Buy a scratch card</Txt>
            <Txt variant="caption" muted className="text-center">
              Reveal nine squares. Match three to win up to 25×.
            </Txt>
          </View>
        )}

        {!cells ? (
          <GameStakeBar
            stake={stake}
            onStakeChange={setStake}
            balance={balance}
            onPlay={buyCard}
            playLabel="BUY CARD"
            busy={buying}
            tone="jade"
          />
        ) : null}

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
