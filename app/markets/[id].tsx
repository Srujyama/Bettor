/**
 * Market detail — the trading screen for one prediction market. Big question, a
 * live PriceChart (built from recent trades' priceCents history, falling back to
 * the current price), a YES/NO price bar, an OrderTicket (buy/sell preview via the
 * shared LMSR math + HoldToConfirm), your current position with live P/L, and a
 * recent-trades list. All money moves server-side via fns.tradeMarket; this screen
 * only reads server state (useMarket / useMarketPosition / live trades).
 */
import { useMemo } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { orderBy, limit as fbLimit } from 'firebase/firestore';
import { Button, Card, ChipCounter, Pill, Screen, Txt } from '@/components/ui';
import { OrderTicket, PriceChart } from '@/components/domain';
import { useCollectionQuery } from '@/hooks/useFirestoreQuery';
import { useMarket, useMarketPosition, useWallet } from '@/hooks/data';
import { useTradeMarket } from '@/features/markets/hooks';
import { paths } from '@/lib/firebase/paths';
import { makeIdempotencyKey } from '@/shared/ids';
import { formatChips } from '@/shared/money';
import { MarketState, MarketSide, SHARE_PAYOUT } from '@/shared/markets';
import type { Market, MarketTrade, MarketPosition } from '@/shared/schemas-markets';
import { colors } from '@/theme';

/** Recent trades for a market, newest first (live). */
function useMarketTrades(marketId: string | null, max = 20) {
  return useCollectionQuery<MarketTrade>(
    ['marketTrades', marketId, max],
    marketId ? paths.marketTrades(marketId) : null,
    [orderBy('createdAt', 'desc'), fbLimit(max)],
    !!marketId,
  );
}

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const marketId = id ?? null;
  const router = useRouter();
  const { width } = useWindowDimensions();

  const { data: market, isLoading } = useMarket(marketId);
  const { data: position } = useMarketPosition(marketId);
  const { data: userDoc } = useWallet();
  const { data: trades } = useMarketTrades(marketId);
  const trade = useTradeMarket();

  const balance = (userDoc as { chipsBalance?: number } | undefined)?.chipsBalance ?? 0;

  // Build the YES-price history oldest→newest. Each trade records the YES price
  // implied at execution: a YES trade stores its own side price; a NO trade stores
  // the NO price, so YES = 100 - that. Fall back to the current price.
  const history = useMemo(() => {
    const yesCents = market?.priceYesCents ?? 50;
    const list = (trades ?? []) as MarketTrade[];
    if (list.length === 0) return [yesCents];
    const chrono = [...list].reverse();
    return chrono.map((t) => (t.side === 'yes' ? t.priceCents : 100 - t.priceCents));
  }, [trades, market?.priceYesCents]);

  if (isLoading && !market) {
    return (
      <Screen>
        <Txt variant="body" muted className="p-6">
          Loading market…
        </Txt>
      </Screen>
    );
  }
  if (!market) {
    return (
      <Screen>
        <Txt variant="body" muted className="p-6">
          Market not found.
        </Txt>
      </Screen>
    );
  }

  const m = market as Market;
  const pos = (position ?? null) as MarketPosition | null;
  const yesCents = m.priceYesCents ?? 50;
  const state: MarketState = { qYes: m.qYes ?? 0, qNo: m.qNo ?? 0, b: m.b };
  const tradable = m.status === 'open' && m.closesAt > Date.now();

  const yesShares = pos?.yesShares ?? 0;
  const noShares = pos?.noShares ?? 0;
  const markValue = Math.round(
    (yesShares * yesCents * SHARE_PAYOUT) / 100 + (noShares * (100 - yesCents) * SHARE_PAYOUT) / 100,
  );
  const unrealized = markValue - (pos?.costBasis ?? 0);

  const onSubmit = (input: { side: MarketSide; action: 'buy' | 'sell'; amount: number }) => {
    if (!marketId) return;
    trade.mutate({
      marketId,
      side: input.side,
      action: input.action,
      amount: input.amount,
      idempotencyKey: makeIdempotencyKey(),
    });
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: m.category }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Pill label={m.category} tone="royal" />
            <Pill
              label={tradable ? 'Open' : m.status}
              tone={tradable ? 'jade' : m.status === 'resolved' ? 'gold' : 'muted'}
            />
          </View>
          <Txt variant="title">{m.question}</Txt>
          {m.description ? (
            <Txt variant="body" dim>
              {m.description}
            </Txt>
          ) : null}
        </View>

        {/* Price chart */}
        <Card>
          <View className="gap-2 p-4">
            <View className="flex-row items-end justify-between">
              <View>
                <Txt variant="caption" muted>
                  YES price
                </Txt>
                <Txt variant="display" style={{ color: colors.jade }}>
                  {yesCents}¢
                </Txt>
              </View>
              <View className="items-end">
                <Txt variant="caption" muted>
                  Volume
                </Txt>
                <ChipCounter value={m.volume ?? 0} size={16} color={colors.textDim} />
              </View>
            </View>
            <PriceChart history={history} currentCents={yesCents} width={width - 64} />
          </View>
        </Card>

        {/* Your position */}
        {pos && (yesShares > 0 || noShares > 0) ? (
          <Card accent={unrealized >= 0 ? colors.jade : colors.coral}>
            <View className="gap-2 p-4">
              <Txt variant="label">Your position</Txt>
              <View className="flex-row gap-2">
                {yesShares > 0 ? <Pill label={`${Math.round(yesShares)} YES`} tone="jade" /> : null}
                {noShares > 0 ? <Pill label={`${Math.round(noShares)} NO`} tone="coral" /> : null}
              </View>
              <View className="flex-row items-center justify-between border-t border-hairline pt-2">
                <View>
                  <Txt variant="caption" muted>
                    Value
                  </Txt>
                  <Txt variant="mono">{formatChips(markValue)}</Txt>
                </View>
                <View className="items-end">
                  <Txt variant="caption" muted>
                    Unrealized P/L
                  </Txt>
                  <Txt variant="mono" style={{ color: unrealized >= 0 ? colors.jade : colors.coral }}>
                    {unrealized >= 0 ? '+' : ''}
                    {formatChips(unrealized)}
                  </Txt>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Order ticket */}
        {tradable ? (
          <OrderTicket
            state={state}
            yesCents={yesCents}
            balance={balance}
            yesShares={yesShares}
            noShares={noShares}
            pending={trade.isPending}
            onSubmit={onSubmit}
          />
        ) : (
          <Card>
            <View className="p-4">
              <Txt variant="label">
                {m.status === 'resolved'
                  ? `Resolved ${m.resolution?.toUpperCase() ?? ''}`
                  : m.status === 'voided'
                    ? 'Voided — positions refunded'
                    : 'Trading closed — awaiting resolution'}
              </Txt>
              <Txt variant="caption" muted>
                Settled in Chips. Chips have no cash value.
              </Txt>
            </View>
          </Card>
        )}

        {/* Recent trades */}
        <View className="gap-2">
          <Txt variant="title">Recent trades</Txt>
          {(trades ?? []).length === 0 ? (
            <Txt variant="caption" muted>
              No trades yet — be the first.
            </Txt>
          ) : (
            (trades ?? []).slice(0, 12).map((t: MarketTrade) => (
              <View
                key={t.tradeId}
                className="flex-row items-center justify-between rounded-card border border-hairline bg-surface px-3 py-2"
              >
                <View className="flex-row items-center gap-2">
                  <Pill
                    label={`${t.action === 'buy' ? 'Bought' : 'Sold'} ${t.side.toUpperCase()}`}
                    tone={t.side === 'yes' ? 'jade' : 'coral'}
                  />
                  <Txt variant="caption" muted>
                    {Math.round(t.shares)} @ {t.priceCents}¢
                  </Txt>
                </View>
                <Txt variant="mono" muted>
                  {formatChips(Math.abs(t.cost))}
                </Txt>
              </View>
            ))
          )}
        </View>

        <Button
          label="Manage positions across markets →"
          tone="ghost"
          size="sm"
          fullWidth={false}
          onPress={() => router.push('/markets/positions')}
        />
      </ScrollView>
    </Screen>
  );
}
