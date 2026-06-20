/**
 * MarketCard — the feed surface for a prediction market. Question, category pill,
 * YES/NO price chips, a MarketSparkline trend, volume, and time-left. Tap fires
 * onPress(marketId). Presentational: pass the Market doc + optional price history.
 */
import { View } from 'react-native';
import { Card, ChipCounter, Pill, Txt } from '@/components/ui';
import { MarketSparkline } from './MarketSparkline';
import { colors } from '@/theme';
import type { Market } from '@/shared/schemas-markets';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const CATEGORY_TONE: Record<string, PillTone> = {
  sports: 'jade',
  crypto: 'gold',
  weather: 'royal',
  politics: 'coral',
  culture: 'royal',
  custom: 'muted',
};

const STATUS_TONE: Record<string, PillTone> = {
  open: 'jade',
  closed: 'royal',
  resolved: 'gold',
  voided: 'muted',
};

/** Human "time left" until closesAt (or a status word when not open). */
function timeLeft(closesAt: number, now: number): string {
  const ms = closesAt - now;
  if (ms <= 0) return 'Closed';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  return `${Math.floor(hrs / 24)}d left`;
}

interface Props {
  market: Market;
  /** Optional YES-cents history (oldest→newest) for the sparkline. */
  history?: number[];
  onPress: (marketId: string) => void;
}

export function MarketCard({ market, history, onPress }: Props) {
  const yes = market.priceYesCents ?? 50;
  const no = 100 - yes;
  const tone = CATEGORY_TONE[market.category] ?? 'muted';
  const now = Date.now();
  const open = market.status === 'open' && market.closesAt > now;

  return (
    <Card onPress={() => onPress(market.marketId)} accent={open ? colors.jade : colors.royal}>
      <View className="gap-3 p-4">
        <View className="flex-row items-center justify-between">
          <Pill label={market.category} tone={tone} />
          <Pill
            label={open ? timeLeft(market.closesAt, now) : market.status}
            tone={open ? 'muted' : STATUS_TONE[market.status] ?? 'muted'}
          />
        </View>

        <Txt variant="heading" numberOfLines={3}>
          {market.question}
        </Txt>

        <View className="flex-row items-center justify-between">
          <View className="flex-row gap-2">
            <View className="rounded-pill px-3 py-1.5" style={{ backgroundColor: `${colors.jade}26` }}>
              <Txt variant="mono" style={{ color: colors.jade }}>
                YES {yes}¢
              </Txt>
            </View>
            <View className="rounded-pill px-3 py-1.5" style={{ backgroundColor: `${colors.coral}26` }}>
              <Txt variant="mono" style={{ color: colors.coral }}>
                NO {no}¢
              </Txt>
            </View>
          </View>
          <MarketSparkline history={history ?? [50, yes]} />
        </View>

        <View className="flex-row items-center justify-between border-t border-hairline pt-2">
          <View className="flex-row items-center gap-1">
            <Txt variant="caption" muted>
              Vol
            </Txt>
            <ChipCounter value={market.volume ?? 0} size={13} color={colors.textDim} />
          </View>
          <Txt variant="caption" muted>
            {market.traderCount ?? 0} traders
          </Txt>
        </View>
      </View>
    </Card>
  );
}
