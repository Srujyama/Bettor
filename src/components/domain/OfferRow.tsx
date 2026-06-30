/**
 * OfferRow — one line in a fixed-odds offer book: the maker, the side they're
 * backing, their price (decimal + fractional + implied %), how much stake is
 * still open, and what a taker stands to win if they lay the whole thing. A Take
 * button routes the lay flow; the maker sees a Cancel control on their own offers.
 *
 * Presentational: actions are owned by the caller (onTake / onCancel).
 */
import { View } from 'react-native';
import { Avatar, Button, Pill, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import {
  impliedProbability,
  toFractional,
  layerRiskFor,
} from '@/shared/fixedodds';
import type { FixedOddsOffer } from '@/shared/schemas-cards';

interface Props {
  offer: FixedOddsOffer;
  /** Outcome label for the side the maker backs. */
  outcomeLabel: string;
  /** True if the viewer is the maker (shows Cancel instead of Take). */
  mine: boolean;
  onTake: () => void;
  onCancel: () => void;
  takeDisabled?: boolean;
}

export function OfferRow({ offer, outcomeLabel, mine, onTake, onCancel, takeDisabled }: Props) {
  const remaining = offer.remainingStake;
  const isTakeable = (offer.status === 'open' || offer.status === 'partial') && remaining > 0;
  const impliedPct = Math.round(impliedProbability(offer.odds) * 100);
  // What a taker would lay (and win) to cover the whole remaining stake.
  const layerRisk = remaining > 0 ? layerRiskFor(remaining, offer.odds) : 0;

  return (
    <View className="gap-3 rounded-card border border-hairline bg-surface p-4">
      <View className="flex-row items-center gap-3">
        <Avatar uri={offer.makerPhotoURL ?? null} name={offer.makerName ?? 'Maker'} size={32} />
        <View className="flex-1">
          <Txt variant="label" numberOfLines={1}>
            {offer.makerName ?? 'A player'}
          </Txt>
          <Txt variant="caption" muted numberOfLines={1}>
            backs {outcomeLabel}
          </Txt>
        </View>
        <View className="items-end">
          <Txt variant="heading" className="font-mono" style={{ color: colors.gold }}>
            {offer.odds.toFixed(2)}
          </Txt>
          <Txt variant="caption" muted>
            {toFractional(offer.odds)} · {impliedPct}%
          </Txt>
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <View>
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Open stake
          </Txt>
          <Txt variant="label" style={{ color: colors.jade }}>
            {formatChips(remaining)} Chips
          </Txt>
        </View>
        <View className="items-end">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Lay to win
          </Txt>
          <Txt variant="label" style={{ color: colors.coral }}>
            {formatChips(remaining)} Chips
          </Txt>
        </View>
      </View>

      {!isTakeable ? (
        <Pill
          label={
            offer.status === 'filled'
              ? 'Fully matched'
              : offer.status === 'cancelled'
                ? 'Cancelled'
                : offer.status === 'settled'
                  ? 'Settled'
                  : 'Closed'
          }
          tone="muted"
        />
      ) : mine ? (
        <Button label="Cancel offer" tone="ghost" size="sm" onPress={onCancel} />
      ) : (
        <Button
          label={`Lay ${formatChips(layerRisk)} to win ${formatChips(remaining)}`}
          tone="coral"
          size="sm"
          onPress={onTake}
          disabled={takeDisabled}
        />
      )}
    </View>
  );
}
