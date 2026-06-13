/**
 * PriceTag — a compact "💎 N Chips" price label. Renders an owned/free state
 * when price is 0 or owned is set. Presentational only; never computes money.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { formatChips } from '@/shared/money';

interface Props {
  price: number;
  /** Show "Owned" instead of a price. */
  owned?: boolean;
  /** Tint the amount (defaults to gold, the prestige/price color). */
  tone?: 'gold' | 'jade' | 'muted';
}

const TONE: Record<NonNullable<Props['tone']>, string> = {
  gold: 'text-gold',
  jade: 'text-jade',
  muted: 'text-muted',
};

export function PriceTag({ price, owned = false, tone = 'gold' }: Props) {
  if (owned) {
    return (
      <Txt variant="label" className="text-jade font-semibold">
        Owned
      </Txt>
    );
  }
  return (
    <View className="flex-row items-center gap-1">
      <Txt variant="label" className={`${TONE[tone]} font-semibold`}>
        💎 {formatChips(price)}
      </Txt>
    </View>
  );
}
