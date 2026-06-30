/**
 * TakeOfferSheet — lay the other side of a maker's offer. Enter how many Chips
 * you're willing to risk; we preview the fill with the SHARED computeFill() —
 * how much of the maker's stake you'd cover (a partial fill if your budget can't
 * cover it all), your escrow, the matched pot, and what you'd win. Commit via a
 * HoldToConfirm.
 *
 * The preview is UX-only; the authoritative fill is computed server-side
 * (fns.takeOffer). Presentational + local draft state: onSubmit is owned by the
 * caller.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Input, Pill, Txt } from '@/components/ui';
import { HoldToConfirm } from './HoldToConfirm';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { computeFill, toFractional } from '@/shared/fixedodds';
import type { FixedOddsOffer } from '@/shared/schemas-cards';

interface Props {
  offer: FixedOddsOffer;
  /** Outcome the maker backs (you'd be laying the other side). */
  outcomeLabel: string;
  balance: number;
  pending?: boolean;
  onSubmit: (budget: number) => void;
}

export function TakeOfferSheet({ offer, outcomeLabel, balance, pending, onSubmit }: Props) {
  const [raw, setRaw] = useState('');
  const budget = Math.max(0, Math.floor(Number(raw) || 0));

  const fill = useMemo(() => {
    if (budget <= 0) return null;
    try {
      return computeFill(offer.remainingStake, offer.odds, budget);
    } catch {
      return null;
    }
  }, [budget, offer.remainingStake, offer.odds]);

  const insufficient = budget > balance;
  const canSubmit = !pending && !insufficient && budget >= STAKE.MIN && !!fill;

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Avatar uri={offer.makerPhotoURL ?? null} name={offer.makerName ?? 'Maker'} size={36} />
        <View className="flex-1">
          <Txt variant="label">{offer.makerName ?? 'A player'} backs {outcomeLabel}</Txt>
          <Txt variant="caption" muted>
            at {offer.odds.toFixed(2)} ({toFractional(offer.odds)}) · {formatChips(offer.remainingStake)} Chips open
          </Txt>
        </View>
      </View>

      <Input
        label="How much to risk (your budget)"
        keyboardType="number-pad"
        prefix="💎"
        placeholder={`Min ${STAKE.MIN}`}
        placeholderTextColor={colors.textFaint}
        value={raw}
        onChangeText={setRaw}
      />

      {fill ? (
        <View className="gap-1 rounded-card bg-surface-raised p-3">
          <Row label="You cover (their stake)" value={`${formatChips(fill.backerStakeMatched)} Chips`} color={colors.text} />
          <Row label="Your risk (escrow)" value={`${formatChips(fill.layerRisk)} Chips`} color={colors.coral} />
          <Row label="Matched pot" value={`${formatChips(fill.pot)} Chips`} color={colors.text} />
          <Row label="You win if their side misses" value={`+${formatChips(fill.backerStakeMatched)} Chips`} color={colors.jade} />
          {fill.remainingAfter > 0 ? (
            <Txt variant="caption" muted className="mt-1">
              Partial fill — {formatChips(fill.remainingAfter)} Chips of this offer stays open.
            </Txt>
          ) : null}
        </View>
      ) : (
        <Txt variant="caption" muted>
          Enter at least {STAKE.MIN} Chips to preview your fill.
        </Txt>
      )}

      {insufficient ? <Pill label="Not enough Chips for this budget" tone="coral" /> : null}

      <View className="items-center pt-1">
        <HoldToConfirm
          label="Hold to lay"
          tone="coral"
          size={120}
          disabled={!canSubmit}
          onConfirm={() => {
            if (!canSubmit) return;
            onSubmit(budget);
            setRaw('');
          }}
        />
        <Txt variant="caption" muted className="mt-2 text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </View>
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <Txt variant="label" style={{ color }}>
        {value}
      </Txt>
    </View>
  );
}
