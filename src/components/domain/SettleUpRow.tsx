/**
 * SettleUpRow — one minimal transfer in the settle-up plan: "Alex pays Mia ·
 * 250". The payer (down money) is coral, the receiver (up money) is jade, with
 * the amount as the hero. Presentational only.
 */
import { View } from 'react-native';
import { Avatar, Txt } from '@/components/ui';
import { formatChips } from '@/shared/money';

interface Props {
  fromName: string;
  toName: string;
  amount: number;
  fromPhotoURL?: string | null;
  toPhotoURL?: string | null;
}

export function SettleUpRow({ fromName, toName, amount, fromPhotoURL, toPhotoURL }: Props) {
  return (
    <View className="flex-row items-center gap-3 rounded-card border border-hairline bg-surface px-3 py-3">
      <Avatar uri={fromPhotoURL ?? undefined} name={fromName} size={34} />
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Txt variant="label" className="text-coral" numberOfLines={1}>
            {fromName}
          </Txt>
          <Txt variant="caption" muted>
            pays
          </Txt>
          <Txt variant="label" className="text-jade" numberOfLines={1}>
            {toName}
          </Txt>
        </View>
      </View>
      <Avatar uri={toPhotoURL ?? undefined} name={toName} size={34} />
      <View className="items-end">
        <Txt variant="heading" className="text-text" style={{ fontVariant: ['tabular-nums'] }}>
          {formatChips(amount)}
        </Txt>
        <Txt variant="caption" muted>
          Chips
        </Txt>
      </View>
    </View>
  );
}
