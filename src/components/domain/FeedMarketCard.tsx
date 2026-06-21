/**
 * FeedMarketCard — a full-screen discovery card for a prediction market. Big
 * question, a live YES/NO price split bar (LMSR price from `@/shared/markets`,
 * display only), volume + trader count, and two one-tap quick-trade buttons that
 * open the QuickTradeSheet. Tapping the body deep-links to the market detail.
 */
import { Pressable, View } from 'react-native';
import { Avatar, Button, ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { HotBadge } from './HotBadge';
import { priceCents, type MarketSide } from '@/shared/markets';
import { formatChips } from '@/shared/money';
import type { Market } from '@/shared/schemas-markets';

interface Props {
  market: Market;
  onOpen: (marketId: string) => void;
  onQuickTrade: (market: Market, side: MarketSide) => void;
}

export function FeedMarketCard({ market, onOpen, onQuickTrade }: Props) {
  const state = { qYes: market.qYes ?? 0, qNo: market.qNo ?? 0, b: market.b };
  const yesCents = priceCents(state, 'yes');
  const noCents = 100 - yesCents;

  return (
    <View className="flex-1 justify-between px-6 py-10">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <HotBadge heat={market.heat ?? 0} />
        <View className="flex-row items-center gap-2">
          <Avatar uri={market.imageUrl ?? null} name={market.creatorName} size={28} />
          <Txt variant="caption" dim numberOfLines={1}>
            {market.creatorName ?? 'Market'}
          </Txt>
        </View>
      </View>

      {/* Big question */}
      <Pressable onPress={() => onOpen(market.marketId)} className="flex-1 justify-center">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Prediction market
        </Txt>
        <Txt variant="display" numberOfLines={3} adjustsFontSizeToFit className="mt-2">
          {market.question}
        </Txt>

        {/* Live price split */}
        <View className="mt-6 gap-2">
          <View className="h-3 flex-row overflow-hidden rounded-pill">
            <View style={{ flex: yesCents, backgroundColor: colors.jade }} />
            <View style={{ flex: noCents, backgroundColor: colors.coral }} />
          </View>
          <View className="flex-row items-center justify-between">
            <Txt variant="label" className="text-jade">
              YES {yesCents}¢
            </Txt>
            <Txt variant="label" className="text-coral">
              {noCents}¢ NO
            </Txt>
          </View>
        </View>

        {/* Stats */}
        <View className="mt-6 flex-row items-center gap-6">
          <View>
            <Txt variant="caption" muted>
              Volume
            </Txt>
            <ChipCounter value={market.volume ?? 0} size={22} color={colors.gold} />
          </View>
          <View>
            <Txt variant="caption" muted>
              Traders
            </Txt>
            <Txt variant="heading">{formatChips(market.traderCount ?? 0)}</Txt>
          </View>
        </View>
      </Pressable>

      {/* Quick actions */}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={`Buy YES ${yesCents}¢`} tone="jade" size="lg" onPress={() => onQuickTrade(market, 'yes')} />
        </View>
        <View className="flex-1">
          <Button label={`Buy NO ${noCents}¢`} tone="coral" size="lg" onPress={() => onQuickTrade(market, 'no')} />
        </View>
      </View>
    </View>
  );
}
