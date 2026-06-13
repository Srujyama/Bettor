/**
 * MultiplierBadge — the gold "×N.NN" odds chip used across the parlay builder and
 * live slip. Purely presentational: the multiplier is computed server-side and
 * previewed client-side with the shared parlayMultiplier helper.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';

interface Props {
  multiplier: number;
  size?: 'sm' | 'md' | 'lg';
}

export function MultiplierBadge({ multiplier, size = 'md' }: Props) {
  const pad = size === 'lg' ? 'px-3.5 py-2' : size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  const fontSize = size === 'lg' ? 22 : size === 'sm' ? 13 : 16;
  return (
    <View className={`self-start rounded-pill border border-gold/40 bg-gold/15 ${pad}`}>
      <Txt
        className="text-gold"
        style={{ fontVariant: ['tabular-nums'], fontWeight: '800', fontSize }}
      >
        ×{multiplier.toFixed(2)}
      </Txt>
    </View>
  );
}
