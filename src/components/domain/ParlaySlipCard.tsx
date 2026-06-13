/**
 * ParlaySlipCard — a compact card for a parlay slip in lists (My Slips). Shows
 * the leg count, combined multiplier, stake, potential payout, a hit/miss
 * progress bar, and a status pill. Tapping opens the live slip. Presentational:
 * progress + payout derive from the shared parlay helpers.
 */
import { Pressable, View } from 'react-native';
import { ChipCounter, Pill, Txt } from '@/components/ui';
import { MultiplierBadge } from './MultiplierBadge';
import { colors } from '@/theme';
import { parlayProgress } from '@/shared/formats';
import type { ParlaySlip } from '@/shared/schemas-ext';

interface Props {
  slip: ParlaySlip;
  onPress?: (slipId: string) => void;
}

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const STATUS_META: Record<ParlaySlip['status'], { label: string; tone: PillTone }> = {
  live: { label: 'Live', tone: 'royal' },
  hit: { label: 'Hit', tone: 'jade' },
  busted: { label: 'Busted', tone: 'coral' },
  settled: { label: 'Settled', tone: 'muted' },
};

export function ParlaySlipCard({ slip, onPress }: Props) {
  const progress = parlayProgress(slip.legs);
  const meta = STATUS_META[slip.status] ?? STATUS_META.live;
  const potential = Math.floor(slip.stake * slip.multiplier);
  const payout = slip.payout ?? potential;
  const won = slip.status === 'hit' || (slip.status === 'settled' && (slip.payout ?? 0) > 0);
  const pct = progress.total > 0 ? progress.resolved / progress.total : 0;

  return (
    <Pressable
      onPress={() => onPress?.(slip.slipId)}
      className="gap-3 rounded-card border border-hairline bg-surface p-4"
      accessibilityRole="button"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Txt variant="label">{slip.legs.length}-leg parlay</Txt>
          <Pill label={meta.label} tone={meta.tone} />
        </View>
        <MultiplierBadge multiplier={slip.multiplier} size="sm" />
      </View>

      {/* Progress: legs resolved / total */}
      <View className="gap-1">
        <View className="h-2 overflow-hidden rounded-pill bg-surface-sunken">
          <View
            style={{
              width: `${Math.round(pct * 100)}%`,
              height: '100%',
              backgroundColor: slip.status === 'busted' ? colors.coral : colors.jade,
            }}
          />
        </View>
        <Txt variant="caption" muted>
          {progress.hit}/{progress.total} legs hit · {progress.resolved} resolved
        </Txt>
      </View>

      <View className="flex-row items-center justify-between border-t border-hairline pt-3">
        <View className="gap-0.5">
          <Txt variant="caption" muted className="uppercase tracking-wide">
            Stake
          </Txt>
          <ChipCounter value={slip.stake} size={18} color={colors.text} />
        </View>
        <View className="items-end gap-0.5">
          <Txt variant="caption" muted className="uppercase tracking-wide">
            {slip.status === 'settled' ? 'Payout' : 'To win'}
          </Txt>
          <ChipCounter
            value={slip.status === 'settled' ? payout : potential}
            size={18}
            color={won || slip.status !== 'settled' ? colors.gold : colors.muted}
          />
        </View>
      </View>
    </Pressable>
  );
}
