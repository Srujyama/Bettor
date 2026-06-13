/**
 * LIVE SQUARES BOARD — the interactive 10×10 grid. Tap a free cell to claim it
 * (escrows the price per square server-side). Your cells glow jade; once the
 * board fills the assigned header digits appear and the board locks. After
 * settlement the winning cell glows gold. All state streams in live.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ChipCounter, Pill, Screen, Txt } from '@/components/ui';
import { SquaresGrid } from '@/components/domain';
import { useSquares, useClaimSquare } from '@/features/formats/hooks';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';
import { squaresFilled } from '@/shared/formats';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import type { SquaresGame } from '@/shared/schemas-ext';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const STATUS_META: Record<SquaresGame['status'], { label: string; tone: PillTone }> = {
  open: { label: 'Open', tone: 'jade' },
  locked: { label: 'Locked', tone: 'royal' },
  settled: { label: 'Settled', tone: 'muted' },
};

export default function SquaresBoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession((s) => s.uid);
  const { data: game, isLoading } = useSquares(id ?? null);
  const claimSquare = useClaimSquare();

  const mineCount = useMemo(
    () => (game ? (game.cells ?? []).filter((c) => c === uid).length : 0),
    [game, uid],
  );

  if (!game) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 items-center justify-center p-8">
          <Txt variant="body" dim>
            {isLoading ? 'Loading board…' : 'Board not found.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  const size = game.size ?? 10;
  const cells = game.cells ?? [];
  const filled = squaresFilled({ size, cells, pricePerSquare: game.pricePerSquare });
  const total = size * size;
  const meta = STATUS_META[game.status] ?? STATUS_META.open;
  const winningCell = (game as { winningCell?: number | null }).winningCell ?? null;

  const onClaim =
    game.status === 'open'
      ? (cellIndex: number) => {
          if (claimSquare.isPending) return;
          void claimSquare.mutateAsync({ gameId: game.gameId, cellIndex });
        }
      : undefined;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View className="gap-2 rounded-card border border-hairline bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Txt variant="heading" numberOfLines={2} className="flex-1">
              {game.title}
            </Txt>
            <Pill label={meta.label} tone={meta.tone} />
          </View>
          <View className="flex-row items-center justify-between border-t border-hairline pt-3">
            <View className="gap-0.5">
              <Txt variant="caption" muted className="uppercase tracking-wide">
                Pool
              </Txt>
              <ChipCounter value={game.poolTotal ?? 0} size={20} color={colors.gold} />
            </View>
            <View className="items-end gap-0.5">
              <Txt variant="caption" muted className="uppercase tracking-wide">
                Filled
              </Txt>
              <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                {filled}/{total}
              </Txt>
            </View>
          </View>
          <Txt variant="caption" muted>
            {formatChips(game.pricePerSquare)} per square · you hold {mineCount}
          </Txt>
        </View>

        <SquaresGrid
          size={size}
          cells={cells}
          rowDigits={game.rowDigits ?? null}
          colDigits={game.colDigits ?? null}
          myUid={uid}
          winningCell={winningCell}
          onClaim={onClaim}
        />

        {game.status === 'open' ? (
          <Txt variant="caption" muted className="text-center">
            Tap a free square to claim it. Digits are assigned when all {total} fill.
          </Txt>
        ) : game.status === 'locked' ? (
          <Txt variant="caption" className="text-center text-royal">
            Board is full and locked. The matching square wins when the final score is in.
          </Txt>
        ) : (
          <Txt variant="caption" className="text-center text-gold">
            Settled — the gold square took the {formatChips(game.poolTotal ?? 0)} pool.
          </Txt>
        )}

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
