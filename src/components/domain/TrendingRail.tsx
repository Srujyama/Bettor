/**
 * TrendingRail — a horizontal "hot now" strip of trending markets shown as a
 * header above the discovery pager. Each chip shows the question (truncated) and
 * the live YES price; tapping jumps the pager to that market (or opens it).
 */
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { priceCents } from '@/shared/markets';
import type { Market } from '@/shared/schemas-markets';

interface Props {
  markets: Market[];
  onPress: (market: Market) => void;
}

export function TrendingRail({ markets, onPress }: Props) {
  if (markets.length === 0) return null;
  return (
    <View className="gap-2">
      <Txt variant="caption" className="px-4 text-coral uppercase tracking-widest">
        🔥 Hot now
      </Txt>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {markets.map((m) => {
          const yes = priceCents({ qYes: m.qYes ?? 0, qNo: m.qNo ?? 0, b: m.b }, 'yes');
          return (
            <Pressable
              key={m.marketId}
              onPress={() => onPress(m)}
              className="w-44 gap-2 rounded-card border border-hairline bg-surface p-3"
            >
              <View style={{ height: 3, backgroundColor: colors.coral, width: 28, borderRadius: 2 }} />
              <Txt variant="label" numberOfLines={2}>
                {m.question}
              </Txt>
              <View className="flex-row items-center justify-between">
                <Txt variant="caption" className="text-jade">
                  YES {yes}¢
                </Txt>
                <Txt variant="caption" muted>
                  {m.priceYesCents ?? yes}¢
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
