/**
 * FeedPager — a full-screen, vertical, snap-paging list (TikTok-style) of
 * discovery cards. One item fills the screen; flicking up/down snaps to the next.
 * Rendering is delegated to FeedMarketCard / FeedBetCard / FeedWinCard by the
 * item's `kind`. Supports pull-to-refresh and onEndReached for capped paging.
 *
 * The data is a discriminated union (`FeedEntry`) the screen builds from the
 * discovery hooks; this component is presentational and owns no data fetching.
 */
import { useCallback } from 'react';
import { RefreshControl, View, useWindowDimensions } from 'react-native';
import { FlatList, type ListRenderItemInfo } from 'react-native';
import { colors } from '@/theme';
import { FeedMarketCard } from './FeedMarketCard';
import { FeedBetCard } from './FeedBetCard';
import { FeedWinCard } from './FeedWinCard';
import type { Market, DiscoveryItem } from '@/shared/schemas-markets';
import type { Bet } from '@/shared/schemas';
import type { MarketSide } from '@/shared/markets';

export type FeedEntry =
  | { id: string; kind: 'market'; market: Market; heat: number }
  | { id: string; kind: 'bet'; bet: Bet; heat: number }
  | { id: string; kind: 'win'; item: DiscoveryItem; heat: number };

interface Props {
  entries: FeedEntry[];
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached?: () => void;
  /** Bottom inset so the last card clears the tab bar. */
  bottomInset?: number;
  onOpenMarket: (marketId: string) => void;
  onOpenBet: (betId: string) => void;
  onQuickTrade: (market: Market, side: MarketSide) => void;
  onQuickJoin: (bet: Bet) => void;
  onShareWin: (item: DiscoveryItem) => void;
  onGetInWin: (item: DiscoveryItem) => void;
}

export function FeedPager({
  entries,
  refreshing,
  onRefresh,
  onEndReached,
  bottomInset = 0,
  onOpenMarket,
  onOpenBet,
  onQuickTrade,
  onQuickJoin,
  onShareWin,
  onGetInWin,
}: Props) {
  const { height } = useWindowDimensions();
  const pageHeight = Math.max(1, height - bottomInset);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedEntry>) => (
      <View style={{ height: pageHeight }}>
        {item.kind === 'market' ? (
          <FeedMarketCard market={item.market} onOpen={onOpenMarket} onQuickTrade={onQuickTrade} />
        ) : item.kind === 'bet' ? (
          <FeedBetCard bet={item.bet} heat={item.heat} onOpen={onOpenBet} onQuickJoin={onQuickJoin} />
        ) : (
          <FeedWinCard item={item.item} onShare={onShareWin} onGetIn={onGetInWin} />
        )}
      </View>
    ),
    [pageHeight, onOpenMarket, onOpenBet, onQuickTrade, onQuickJoin, onShareWin, onGetInWin],
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      renderItem={renderItem}
      pagingEnabled
      snapToInterval={pageHeight}
      snapToAlignment="start"
      decelerationRate="fast"
      disableIntervalMomentum
      showsVerticalScrollIndicator={false}
      getItemLayout={(_data, index) => ({
        length: pageHeight,
        offset: pageHeight * index,
        index,
      })}
      onEndReachedThreshold={0.5}
      onEndReached={onEndReached}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.jade} />
      }
    />
  );
}
