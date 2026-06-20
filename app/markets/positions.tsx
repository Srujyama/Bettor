/**
 * Your positions — open market positions across all markets with live
 * mark-to-market value and P/L. The pilot `useMyPositions` hook takes an explicit
 * set of candidate market ids (no collection-group index yet), so we gather ids
 * from the live markets + trending feeds, fetch the user's position in each, and
 * render the non-empty ones as PositionRows. Tap opens the market.
 */
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { EmptyState, Screen, Txt } from '@/components/ui';
import { PositionRow } from '@/components/domain';
import { useMarkets, useTrendingMarkets, useMyPositions } from '@/hooks/data';
import { formatChips } from '@/shared/money';
import { SHARE_PAYOUT } from '@/shared/markets';
import type { Market, MarketPosition } from '@/shared/schemas-markets';

export default function PositionsScreen() {
  const router = useRouter();
  const { data: markets } = useMarkets({}, 40);
  const { data: trending } = useTrendingMarkets(20);

  // Build a de-duped market-id → market lookup and a candidate id list.
  const byId = useMemo(() => {
    const map = new Map<string, Market>();
    for (const m of [...(trending ?? []), ...(markets ?? [])] as Market[]) {
      if (!map.has(m.marketId)) map.set(m.marketId, m);
    }
    return map;
  }, [markets, trending]);

  const candidateIds = useMemo(() => Array.from(byId.keys()), [byId]);
  const { data: positions, isLoading } = useMyPositions(candidateIds);

  const open = (id: string) => router.push(`/markets/${id}`);

  // Aggregate value across open positions for a header summary.
  const totalValue = (positions ?? []).reduce((sum: number, p: MarketPosition) => {
    const m = byId.get(p.marketId);
    const yes = m?.priceYesCents ?? 50;
    const v =
      (p.yesShares * yes * SHARE_PAYOUT) / 100 + (p.noShares * (100 - yes) * SHARE_PAYOUT) / 100;
    return sum + Math.round(v);
  }, 0);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Your positions' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}>
        <View className="flex-row items-center justify-between">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Open value
          </Txt>
          <Txt variant="title">{formatChips(totalValue)}</Txt>
        </View>

        {isLoading ? (
          <Txt variant="caption" muted>
            Loading positions…
          </Txt>
        ) : (positions ?? []).length === 0 ? (
          <EmptyState
            emoji="📊"
            title="No open positions"
            subtitle="Buy YES or NO on a market and it shows up here."
            actionLabel="Browse markets"
            onAction={() => router.push('/markets')}
          />
        ) : (
          (positions ?? []).map((p: MarketPosition) => {
            const m = byId.get(p.marketId);
            return (
              <PositionRow
                key={p.marketId}
                position={p}
                question={m?.question ?? 'Market'}
                yesCents={m?.priceYesCents ?? 50}
                onPress={open}
              />
            );
          })
        )}

        <Txt variant="caption" muted className="px-1">
          Position values are marked to the live price. Chips have no cash value.
        </Txt>
      </ScrollView>
    </Screen>
  );
}
