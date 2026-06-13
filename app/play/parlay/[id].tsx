/**
 * LIVE PARLAY SLIP — the per-leg state of a placed slip. Header shows the stake,
 * combined multiplier and potential/actual payout; a progress bar tracks legs
 * resolved; each leg renders with its hit/miss/pending dot via ParlayLegRow.
 * All state is server-written and streams in live; no money is computed here.
 */
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ChipCounter, Pill, Screen, Txt } from '@/components/ui';
import { MultiplierBadge, ParlayLegRow } from '@/components/domain';
import { useParlay } from '@/features/formats/hooks';
import { colors } from '@/theme';
import { parlayProgress } from '@/shared/formats';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import type { ParlaySlip } from '@/shared/schemas-ext';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const STATUS_META: Record<ParlaySlip['status'], { label: string; tone: PillTone }> = {
  live: { label: 'Live', tone: 'royal' },
  hit: { label: 'Hit', tone: 'jade' },
  busted: { label: 'Busted', tone: 'coral' },
  settled: { label: 'Settled', tone: 'muted' },
};

export default function ParlaySlipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: slip, isLoading } = useParlay(id ?? null);

  if (!slip) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 items-center justify-center p-8">
          <Txt variant="body" dim>
            {isLoading ? 'Loading slip…' : 'Slip not found.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  const progress = parlayProgress(slip.legs);
  const meta = STATUS_META[slip.status] ?? STATUS_META.live;
  const potential = Math.floor(slip.stake * slip.multiplier);
  const settledPayout = slip.payout ?? 0;
  const isSettled = slip.status === 'settled';
  const pct = progress.total > 0 ? progress.resolved / progress.total : 0;
  const barColor = slip.status === 'busted' ? colors.coral : colors.jade;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View className="gap-3 rounded-card border border-hairline bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Txt variant="heading">{slip.legs.length}-leg parlay</Txt>
              <Pill label={meta.label} tone={meta.tone} />
            </View>
            <MultiplierBadge multiplier={slip.multiplier} />
          </View>

          <View className="gap-1">
            <View className="h-2 overflow-hidden rounded-pill bg-surface-sunken">
              <View
                style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: barColor }}
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
              <ChipCounter value={slip.stake} size={20} color={colors.text} />
            </View>
            <View className="items-end gap-0.5">
              <Txt variant="caption" muted className="uppercase tracking-wide">
                {isSettled ? 'Payout' : 'To win'}
              </Txt>
              <ChipCounter
                value={isSettled ? settledPayout : potential}
                size={20}
                color={isSettled && settledPayout === 0 ? colors.muted : colors.gold}
              />
            </View>
          </View>
        </View>

        <View className="gap-1">
          <Txt variant="label" dim className="uppercase tracking-widest">
            Legs
          </Txt>
          <View className="rounded-card border border-hairline bg-surface px-4">
            {slip.legs.map((leg) => (
              <ParlayLegRow key={leg.legId} leg={leg} live />
            ))}
          </View>
        </View>

        {slip.status === 'busted' ? (
          <Txt variant="caption" className="text-center text-coral">
            One leg missed — the slip is busted.
          </Txt>
        ) : slip.status === 'hit' ? (
          <Txt variant="caption" className="text-center text-jade">
            Every leg hit. Payout settling shortly.
          </Txt>
        ) : null}

        <Txt variant="caption" muted className="text-center">
          {formatChips(slip.stake)} staked · {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
