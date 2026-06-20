/**
 * HOT tab — the discovery feed: a full-screen, vertical, TikTok-style pager of
 * markets, bets and big wins. Quick-action buttons on each card open a bottom
 * sheet to trade/join in 1–2 taps without leaving the feed.
 *
 * DATA SOURCE (documented choice): the feed PREFERS the materialized `discovery`
 * collection (built by the `buildDiscovery` scheduled CF — see
 * functions/src/scheduled/buildDiscovery.ts). For each discovery item we hydrate
 * the live underlying doc (market/bet) so prices/pots stay real-time. When the
 * `discovery` collection is empty (e.g. before the sweep first runs in the
 * pilot) we FALL BACK to merging trending markets + open bets client-side, so
 * the feed is never blank. Big-win/game-win cards render straight from the
 * (self-contained) discovery item.
 */
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, Txt, EmptyState } from '@/components/ui';
import {
  FeedPager,
  TrendingRail,
  QuickTradeSheet,
  QuickBetSheet,
  type FeedEntry,
  type QuickTradeSheetRef,
  type QuickBetSheetRef,
} from '@/components/domain';
import {
  useDiscoveryFeed,
  useTrendingMarkets,
  useMarkets,
  useDiscoverBets,
} from '@/hooks/data';
import { useCelebrateWin } from '@/features/feed/hooks';
import type { Market, DiscoveryItem } from '@/shared/schemas-markets';
import type { Bet } from '@/shared/schemas';
import type { MarketSide } from '@/shared/markets';

/** Height the bottom tab bar occupies (mirror of (tabs)/_layout). */
const TAB_BAR_HEIGHT = 84;

/**
 * Cross-track routes (`/markets/[id]`, `/casino`) are owned by the Markets and
 * Casino tracks and their typed-route definitions may not be generated yet in
 * this slice's isolated typecheck. `go()` navigates via the runtime router while
 * staying type-clean regardless of which screens have been added.
 */
type Href = Parameters<typeof router.push>[0];
function go(path: string) {
  router.push(path as Href);
}

export default function HotScreen() {
  const insets = useSafeAreaInsets();
  const { data: discovery, isLoading: discoLoading } = useDiscoveryFeed(40);
  const { data: trending } = useTrendingMarkets(12);
  const { data: openMarkets } = useMarkets({ sort: 'heat' }, 30);
  const { data: openBets } = useDiscoverBets(30);

  const tradeSheet = useRef<QuickTradeSheetRef>(null);
  const betSheet = useRef<QuickBetSheetRef>(null);
  const celebrate = useCelebrateWin();
  const [refreshing, setRefreshing] = useState(false);

  // Index live docs so discovery items can hydrate to real-time prices/pots.
  const marketById = useMemo(() => {
    const m = new Map<string, Market>();
    for (const mk of openMarkets ?? []) m.set(mk.marketId, mk);
    for (const mk of trending ?? []) m.set(mk.marketId, mk);
    return m;
  }, [openMarkets, trending]);

  const betById = useMemo(() => {
    const m = new Map<string, Bet>();
    for (const b of openBets ?? []) m.set(b.betId, b);
    return m;
  }, [openBets]);

  const entries = useMemo<FeedEntry[]>(() => {
    // 1) Preferred path: hydrate the materialized discovery feed.
    if ((discovery ?? []).length > 0) {
      const out: FeedEntry[] = [];
      for (const it of discovery as DiscoveryItem[]) {
        if (it.kind === 'market') {
          const live = marketById.get(it.refId);
          if (live) out.push({ id: it.itemId, kind: 'market', market: live, heat: it.heat ?? 0 });
        } else if (it.kind === 'bet') {
          const live = betById.get(it.refId);
          if (live) out.push({ id: it.itemId, kind: 'bet', bet: live, heat: it.heat ?? 0 });
        } else {
          // big_win / game_win are self-contained.
          out.push({ id: it.itemId, kind: 'win', item: it, heat: it.heat ?? 0 });
        }
      }
      if (out.length > 0) return out;
    }

    // 2) Fallback: interleave trending markets + open bets client-side.
    const merged: FeedEntry[] = [];
    const ms = (openMarkets ?? []).map<FeedEntry>((m) => ({
      id: `m_${m.marketId}`,
      kind: 'market',
      market: m,
      heat: m.heat ?? 0,
    }));
    const bs = (openBets ?? []).map<FeedEntry>((b) => ({
      id: `b_${b.betId}`,
      kind: 'bet',
      bet: b,
      heat: 0,
    }));
    const max = Math.max(ms.length, bs.length);
    for (let i = 0; i < max; i++) {
      if (i < ms.length) merged.push(ms[i]);
      if (i < bs.length) merged.push(bs[i]);
    }
    return merged;
  }, [discovery, marketById, betById, openMarkets, openBets]);

  const onRefresh = () => {
    // Reads are live (onSnapshot); the refresh is a UX affordance. Flash briefly.
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const openMarket = (marketId: string) => go(`/markets/${marketId}`);
  const openBet = (betId: string) => go(`/bet/${betId}`);

  const onQuickTrade = (market: Market, side: MarketSide) => tradeSheet.current?.present(market, side);
  const onQuickJoin = (bet: Bet) => betSheet.current?.present(bet);

  const onShareWin = (item: DiscoveryItem) => {
    if (item.amount != null) celebrate({ betId: item.refId, amount: item.amount });
  };
  const onGetInWin = (item: DiscoveryItem) => {
    if (item.kind === 'game_win') go('/casino');
    else openBet(item.refId);
  };

  if (entries.length === 0) {
    return (
      <Screen edges={['top']}>
        <View className="flex-1 items-center justify-center px-6">
          {discoLoading ? (
            <Txt variant="body" dim>
              Loading what's hot…
            </Txt>
          ) : (
            <EmptyState
              emoji="🔥"
              title="Nothing hot yet"
              subtitle="Open a market or a bet and it'll show up here for the room."
              actionLabel="Create a bet"
              onAction={() => router.push('/(modals)/create-bet')}
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FeedPager
        entries={entries}
        refreshing={refreshing}
        onRefresh={onRefresh}
        bottomInset={TAB_BAR_HEIGHT}
        onOpenMarket={openMarket}
        onOpenBet={openBet}
        onQuickTrade={onQuickTrade}
        onQuickJoin={onQuickJoin}
        onShareWin={onShareWin}
        onGetInWin={onGetInWin}
      />

      {/* Trending rail overlay — floats above the first card, clear of the notch. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: insets.top + 6, left: 0, right: 0 }}
      >
        <TrendingRail
          markets={trending ?? []}
          onPress={(m) => go(`/markets/${m.marketId}`)}
        />
      </View>

      <QuickTradeSheet ref={tradeSheet} />
      <QuickBetSheet ref={betSheet} />
    </View>
  );
}
