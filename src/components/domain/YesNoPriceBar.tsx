/**
 * YesNoPriceBar — a horizontal YES/NO split that reads as a probability bar. The
 * YES segment (jade) is sized to the YES price in cents; the NO segment (coral)
 * fills the rest. Each side shows its price in cents ("¢ on the dollar"). Tapping
 * a side fires onPick so it doubles as the side selector on the detail screen.
 */
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import type { MarketSide } from '@/shared/markets';

interface Props {
  yesCents: number; // 1..99
  /** Currently-selected side (highlights it). */
  selected?: MarketSide | null;
  onPick?: (side: MarketSide) => void;
  height?: number;
}

export function YesNoPriceBar({ yesCents, selected, onPick, height = 56 }: Props) {
  const yes = Math.max(1, Math.min(99, yesCents));
  const no = 100 - yes;

  const Side = ({ side, cents }: { side: MarketSide; cents: number }) => {
    const isYes = side === 'yes';
    const active = selected === side;
    const tint = isYes ? colors.jade : colors.coral;
    return (
      <Pressable
        onPress={onPick ? () => onPick(side) : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${isYes ? 'Yes' : 'No'} ${cents} cents`}
        style={{
          flex: cents,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? tint : `${tint}26`,
          borderColor: tint,
          borderWidth: active ? 1.5 : 0,
        }}
      >
        <Txt
          variant="label"
          style={{ color: active ? colors.ink : tint }}
          className="font-display uppercase"
        >
          {isYes ? 'Yes' : 'No'}
        </Txt>
        <Txt variant="mono" style={{ color: active ? colors.ink : tint }}>
          {cents}¢
        </Txt>
      </Pressable>
    );
  };

  return (
    <View className="flex-row overflow-hidden rounded-card border border-hairline">
      <Side side="yes" cents={yes} />
      <Side side="no" cents={no} />
    </View>
  );
}
