/**
 * NetBadge — a signed Chip delta. Up = jade (+N), down = coral (−N), even =
 * muted. The hero number on a card ledger: who's winning, who's stuck.
 * Presentational only; never computes money (the net is server-written).
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { formatChips } from '@/shared/money';

interface Props {
  /** Signed net in Chips (cashOut - buyIn). Positive = up. */
  net: number;
  size?: 'sm' | 'md' | 'lg';
  /** Show the "Chips" suffix. */
  showUnit?: boolean;
}

const FONT: Record<NonNullable<Props['size']>, number> = { sm: 15, md: 20, lg: 30 };

export function NetBadge({ net, size = 'md', showUnit = false }: Props) {
  const up = net > 0;
  const even = net === 0;
  const color = even ? 'text-muted' : up ? 'text-jade' : 'text-coral';
  const sign = even ? '' : up ? '+' : '−';
  const magnitude = formatChips(Math.abs(net));

  return (
    <View className="flex-row items-baseline gap-1">
      <Txt
        className={`${color} font-display`}
        style={{ fontSize: FONT[size], fontWeight: '800', letterSpacing: -0.5 }}
      >
        {sign}
        {magnitude}
      </Txt>
      {showUnit ? (
        <Txt variant="caption" className={color}>
          Chips
        </Txt>
      ) : null}
    </View>
  );
}
