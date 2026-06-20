/**
 * OrderTicket — the buy/sell control on a market detail screen. Pick a side and a
 * Chip budget (buy) or a share count (sell); we preview the trade live with the
 * SHARED LMSR math (quoteBuy / quoteSell) — shares, avg price, potential payout —
 * and commit through a HoldToConfirm (deliberate friction for spending Chips).
 *
 * The client preview is for UX only; the authoritative numbers come from the
 * server (tradeMarket). Presentational + local draft state: onSubmit owned by the
 * caller, which calls fns.tradeMarket and reads back state via the live hooks.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Button, Input, Txt } from '@/components/ui';
import { HoldToConfirm } from './HoldToConfirm';
import { YesNoPriceBar } from './YesNoPriceBar';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { MarketState, MarketSide, quoteBuy, quoteSell } from '@/shared/markets';

interface Props {
  state: MarketState;
  yesCents: number;
  balance: number;
  /** Shares the user already holds, for capping a sell. */
  yesShares: number;
  noShares: number;
  disabled?: boolean;
  pending?: boolean;
  onSubmit: (input: { side: MarketSide; action: 'buy' | 'sell'; amount: number }) => void;
}

export function OrderTicket({
  state,
  yesCents,
  balance,
  yesShares,
  noShares,
  disabled,
  pending,
  onSubmit,
}: Props) {
  const [action, setAction] = useState<'buy' | 'sell'>('buy');
  const [side, setSide] = useState<MarketSide>('yes');
  const [raw, setRaw] = useState('');

  const amount = Math.max(0, Math.floor(Number(raw) || 0));
  const heldOnSide = side === 'yes' ? yesShares : noShares;

  const preview = useMemo(() => {
    if (action === 'buy') {
      if (amount <= 0) return null;
      const q = quoteBuy(state, side, amount);
      return q.shares > 0
        ? {
            line1: `${q.shares} shares @ ~${q.avgPriceCents}¢`,
            line2: `Cost ${formatChips(q.cost)} · Potential payout ${formatChips(q.potentialPayout)}`,
          }
        : null;
    }
    if (amount <= 0) return null;
    const q = quoteSell(state, side, Math.min(amount, heldOnSide));
    return { line1: `Sell ${Math.min(amount, heldOnSide)} shares`, line2: `Proceeds ~${formatChips(q.proceeds)}` };
  }, [action, side, amount, state, heldOnSide]);

  const canBuy = action === 'buy' && amount > 0 && amount <= balance;
  const canSell = action === 'sell' && amount > 0 && heldOnSide > 0;
  const canSubmit = !disabled && !pending && (canBuy || canSell);

  return (
    <View className="gap-4 rounded-card border border-hairline bg-surface p-4">
      {/* Buy / Sell toggle */}
      <View className="flex-row gap-2">
        <Button
          label="Buy"
          tone={action === 'buy' ? 'jade' : 'ghost'}
          size="sm"
          onPress={() => setAction('buy')}
        />
        <Button
          label="Sell"
          tone={action === 'sell' ? 'coral' : 'ghost'}
          size="sm"
          onPress={() => setAction('sell')}
        />
      </View>

      <YesNoPriceBar yesCents={yesCents} selected={side} onPick={setSide} />

      <Input
        label={action === 'buy' ? 'Chip budget' : 'Shares to sell'}
        keyboardType="number-pad"
        prefix={action === 'buy' ? '💎' : '◇'}
        placeholder={action === 'buy' ? 'e.g. 100' : `Held: ${heldOnSide}`}
        placeholderTextColor={colors.textFaint}
        value={raw}
        onChangeText={setRaw}
      />

      {preview ? (
        <View className="rounded-card bg-surface-raised p-3">
          <Txt variant="label">{preview.line1}</Txt>
          <Txt variant="caption" muted>
            {preview.line2}
          </Txt>
        </View>
      ) : (
        <Txt variant="caption" muted>
          {action === 'buy'
            ? 'Enter how many Chips to spend on this side.'
            : 'Enter how many shares to sell back to the market.'}
        </Txt>
      )}

      <View className="items-center pt-1">
        <HoldToConfirm
          label={action === 'buy' ? `Buy ${side.toUpperCase()}` : `Sell ${side.toUpperCase()}`}
          tone={side === 'yes' ? 'jade' : 'coral'}
          size={120}
          disabled={!canSubmit}
          onConfirm={() => {
            onSubmit({ side, action, amount: action === 'sell' ? Math.min(amount, heldOnSide) : amount });
            setRaw('');
          }}
        />
      </View>

      <Txt variant="caption" muted className="text-center">
        Chips have no cash value.
      </Txt>
    </View>
  );
}
