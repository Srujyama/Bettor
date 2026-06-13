/**
 * ParlayLegRow — a single leg in the builder or the live slip. Shows the pick
 * label, optional per-leg odds, and a hit/miss/pending status dot. In the
 * builder a remove control is shown; in the live view the leg result tints the
 * row. Presentational: leg result comes from the shared legResult() helper.
 */
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { legResult, type ParlayLegLike } from '@/shared/formats';

interface Props {
  leg: ParlayLegLike & { label: string };
  /** Show the × remove affordance (builder mode). */
  onRemove?: () => void;
  /** When false, render the static pick without the status dot (builder). */
  live?: boolean;
}

const STATUS_COLOR: Record<'pending' | 'hit' | 'miss', string> = {
  pending: colors.muted,
  hit: colors.jade,
  miss: colors.coral,
};

const STATUS_LABEL: Record<'pending' | 'hit' | 'miss', string> = {
  pending: 'Pending',
  hit: 'Hit',
  miss: 'Missed',
};

export function ParlayLegRow({ leg, onRemove, live = false }: Props) {
  const result = legResult(leg);
  const dot = STATUS_COLOR[result];

  return (
    <View className="flex-row items-center gap-3 border-b border-hairline py-3">
      {live ? (
        <View
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }}
          accessibilityLabel={STATUS_LABEL[result]}
        />
      ) : null}

      <View className="flex-1 gap-0.5">
        <Txt variant="body" numberOfLines={2}>
          {leg.label}
        </Txt>
        {live ? (
          <Txt
            variant="caption"
            style={{ color: dot }}
            className="uppercase tracking-wide"
          >
            {STATUS_LABEL[result]}
          </Txt>
        ) : null}
      </View>

      {leg.odds && leg.odds > 1 ? (
        <Txt
          variant="label"
          className="text-gold"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          ×{leg.odds.toFixed(2)}
        </Txt>
      ) : (
        <Txt variant="label" muted style={{ fontVariant: ['tabular-nums'] }}>
          ×2.00
        </Txt>
      )}

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          className="h-8 w-8 items-center justify-center rounded-chip border border-hairline bg-surface-raised"
          accessibilityRole="button"
          accessibilityLabel="Remove leg"
        >
          <Txt variant="heading" muted>
            ×
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}
