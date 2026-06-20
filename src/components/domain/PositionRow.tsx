/**
 * PositionRow — one of the user's market positions with live mark-to-market value
 * and P/L. We value open shares at the current market price (YES shares × yesPrice
 * + NO shares × noPrice, each scaled to SHARE_PAYOUT) and compare to the remaining
 * cost basis. Color follows the unrealized P/L (jade up, coral down). Tap opens
 * the market. Presentational: pass the position + the market's current YES cents.
 */
import { View } from 'react-native';
import { Card, Pill, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { SHARE_PAYOUT } from '@/shared/markets';
import type { MarketPosition } from '@/shared/schemas-markets';

interface Props {
  position: MarketPosition;
  question: string;
  yesCents: number;
  onPress: (marketId: string) => void;
}

export function PositionRow({ position, question, yesCents, onPress }: Props) {
  const yes = Math.max(1, Math.min(99, yesCents));
  const yesVal = (position.yesShares * yes * SHARE_PAYOUT) / 100;
  const noVal = (position.noShares * (100 - yes) * SHARE_PAYOUT) / 100;
  const markValue = Math.round(yesVal + noVal);
  const unrealized = markValue - (position.costBasis ?? 0);
  const up = unrealized >= 0;
  const totalShares = position.yesShares + position.noShares;

  return (
    <Card onPress={() => onPress(position.marketId)} accent={up ? colors.jade : colors.coral}>
      <View className="gap-2 p-4">
        <Txt variant="label" numberOfLines={2}>
          {question}
        </Txt>
        <View className="flex-row items-center gap-2">
          {position.yesShares > 0 ? (
            <Pill label={`${Math.round(position.yesShares)} YES`} tone="jade" />
          ) : null}
          {position.noShares > 0 ? (
            <Pill label={`${Math.round(position.noShares)} NO`} tone="coral" />
          ) : null}
          {totalShares === 0 ? <Pill label="Closed" tone="muted" /> : null}
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
            <Txt variant="mono" style={{ color: up ? colors.jade : colors.coral }}>
              {up ? '+' : ''}
              {formatChips(unrealized)}
            </Txt>
          </View>
        </View>
      </View>
    </Card>
  );
}
