/**
 * PoolMeter — the hero pool display: a big ChipCounter of the pot total, a
 * "N players · M Chips in the pot" subtitle, and the TwoSidedBar showing how
 * the pool is split across outcomes. Accepts a whole Bet or the loose fields.
 * Presentational only.
 */
import { View } from 'react-native';
import { ChipCounter, TwoSidedBar, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import type { Bet, Outcome } from '@/shared/schemas';

type Props =
  | { bet: Bet; mySide?: string | null }
  | {
      poolTotal: number;
      poolByOutcome: Record<string, number>;
      outcomes: Outcome[];
      entryCount: number;
      mySide?: string | null;
    };

function fromProps(props: Props): {
  poolTotal: number;
  poolByOutcome: Record<string, number>;
  outcomes: Outcome[];
  entryCount: number;
  mySide?: string | null;
} {
  if ('bet' in props) {
    const { bet, mySide } = props;
    return {
      poolTotal: bet.poolTotal,
      poolByOutcome: bet.poolByOutcome,
      outcomes: bet.outcomes,
      entryCount: bet.entryCount,
      mySide,
    };
  }
  return props;
}

export function PoolMeter(props: Props) {
  const { poolTotal, poolByOutcome, outcomes, entryCount, mySide } = fromProps(props);

  const segments = outcomes.map((o) => ({
    outcomeId: o.id,
    label: o.label,
    amount: poolByOutcome[o.id] ?? 0,
  }));

  const playerLabel = entryCount === 1 ? '1 player' : `${formatChips(entryCount)} players`;

  return (
    <View className="gap-4 rounded-card border border-hairline bg-surface p-5">
      <View className="items-center gap-1">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          In the pot
        </Txt>
        <ChipCounter value={poolTotal} size={48} color={colors.gold} />
        <Txt variant="caption" dim>
          {playerLabel} · {formatChips(poolTotal)} Chips in the pot
        </Txt>
      </View>
      <TwoSidedBar segments={segments} mySide={mySide} height={14} />
    </View>
  );
}
