/**
 * OwnedBadge — a tiny corner badge marking a cosmetic as owned and/or equipped.
 * Presentational. Renders nothing when neither flag is set.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';

interface Props {
  owned?: boolean;
  equipped?: boolean;
}

export function OwnedBadge({ owned = false, equipped = false }: Props) {
  if (!owned && !equipped) return null;
  const equippedState = equipped;
  return (
    <View
      className={`self-start rounded-pill border px-2 py-0.5 ${
        equippedState ? 'bg-jade/20 border-jade/50' : 'bg-white/5 border-hairline'
      }`}
    >
      <Txt
        variant="caption"
        className={`${equippedState ? 'text-jade' : 'text-muted'} font-semibold`}
      >
        {equippedState ? '✓ Equipped' : 'Owned'}
      </Txt>
    </View>
  );
}
