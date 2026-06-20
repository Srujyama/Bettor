/**
 * Coin Flip — pick heads or tails, then flip an animated coin to the SERVER
 * result. The landed face comes entirely from the server; the client only spins
 * the coin and eases to that face. Near-even odds (small house edge).
 */
import { useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { Stack } from 'expo-router';
import { Screen, Txt } from '@/components/ui';
import { CoinFlip3D, GameStakeBar, BigWinOverlay, ProvablyFairBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useWallet } from '@/hooks/data';
import { usePlayGame } from '@/features/casino/hooks';
import type { PlayGameResult } from '@/lib/firebase/functions';
import { makeId } from '@/shared/ids';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

type Face = 'heads' | 'tails';

interface WalletView {
  chipsBalance?: number;
}

export default function CoinFlipScreen() {
  const { data: wallet } = useWallet();
  const balance = (wallet as WalletView | undefined)?.chipsBalance ?? 0;
  const play = usePlayGame();

  const [stake, setStake] = useState<number>(STAKE.MIN);
  const [pick, setPick] = useState<Face>('heads');
  const [flipping, setFlipping] = useState(false);
  const [last, setLast] = useState<PlayGameResult | null>(null);
  const [showWin, setShowWin] = useState(false);

  const result = (last?.result?.result as Face | undefined) ?? null;
  const won = (last?.result?.won as boolean | undefined) ?? false;

  const flip = () => {
    if (flipping || play.isPending) return;
    setFlipping(true);
    setShowWin(false);
    play.mutate(
      { game: 'coinflip', stake, clientSeed: makeId(), params: { pick } },
      {
        onSuccess: (res) => {
          setLast(res);
          setTimeout(() => {
            setFlipping(false);
            if (res.payout > 0) setTimeout(() => setShowWin(true), 1600);
          }, 600);
        },
        onError: () => setFlipping(false),
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Coin Flip' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <View className="items-center pt-2">
          <CoinFlip3D result={flipping ? null : result} flipping={flipping} pick={pick} />
        </View>

        {last && !flipping ? (
          <View className="items-center">
            <Txt variant="heading" style={{ color: won ? colors.jade : colors.textDim }}>
              {won ? `${result?.toUpperCase()} — won ${last.payout} Chips` : `${result?.toUpperCase()} — no win`}
            </Txt>
          </View>
        ) : null}

        {/* Heads / Tails picker */}
        <View className="flex-row gap-3">
          {(['heads', 'tails'] as Face[]).map((face) => {
            const active = pick === face;
            return (
              <Pressable
                key={face}
                disabled={flipping || play.isPending}
                onPress={() => setPick(face)}
                className={`flex-1 items-center rounded-card border p-4 ${
                  active ? 'border-coral/60 bg-coral/15' : 'border-hairline bg-surface'
                }`}
              >
                <Txt style={{ fontSize: 30 }}>{face === 'heads' ? '👑' : '🪙'}</Txt>
                <Txt variant="label" style={{ color: active ? colors.coral : colors.textDim }}>
                  {face.toUpperCase()}
                </Txt>
              </Pressable>
            );
          })}
        </View>

        <GameStakeBar
          stake={stake}
          onStakeChange={setStake}
          balance={balance}
          onPlay={flip}
          playLabel={`FLIP ON ${pick.toUpperCase()}`}
          busy={flipping || play.isPending}
          tone="coral"
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
