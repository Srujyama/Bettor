/**
 * PARLAY BUILDER — assemble a multi-leg slip from open bets and upcoming
 * fixtures, watch the combined multiplier + potential payout update live, set
 * the stake, and submit. The client only previews math with the shared
 * parlayMultiplier helper; the server recomputes + escrows authoritatively.
 *
 * A leg picks one outcome of a source. Each picked leg carries a decimal `odds`
 * (default 2.0 even) so the preview matches the server's capped multiplier.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Input, Pill, Screen, Txt } from '@/components/ui';
import { MultiplierBadge, ParlayLegRow, SegmentedTabs } from '@/components/domain';
import { useCreateParlay } from '@/features/formats/hooks';
import { useDiscoverBets, useFixtures } from '@/hooks/data';
import { colors } from '@/theme';
import { parlayMultiplier, type ParlayLegLike } from '@/shared/formats';
import { makeIdempotencyKey } from '@/shared/ids';
import { formatChips } from '@/shared/money';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

interface DraftLeg extends ParlayLegLike {
  key: string;
  label: string;
  betId: string | null;
  fixtureId: string | null;
}

const SOURCES = ['Open bets', 'Fixtures'] as const;
type Source = (typeof SOURCES)[number];

const MAX_LEGS = 12;

export default function ParlayBuilder() {
  const createParlay = useCreateParlay();
  const { data: bets } = useDiscoverBets(50);
  const { data: fixtures } = useFixtures({ status: 'scheduled' }, 50);

  const [source, setSource] = useState<Source>('Open bets');
  const [legs, setLegs] = useState<DraftLeg[]>([]);
  const [stake, setStake] = useState('100');

  const multiplier = useMemo(() => parlayMultiplier(legs), [legs]);
  const stakeNum = Number(stake) || 0;
  const potential = Math.floor(stakeNum * multiplier);

  const hasLeg = (predicate: (l: DraftLeg) => boolean) => legs.some(predicate);

  const addLeg = (leg: DraftLeg) => {
    if (legs.length >= MAX_LEGS) return;
    setLegs((prev) => [...prev, leg]);
  };
  const removeLeg = (key: string) => setLegs((prev) => prev.filter((l) => l.key !== key));

  const canSubmit =
    legs.length >= 2 &&
    Number.isInteger(stakeNum) &&
    stakeNum >= STAKE.MIN &&
    stakeNum <= STAKE.DEFAULT_MAX &&
    !createParlay.isPending;

  const submit = async () => {
    const res = await createParlay.mutateAsync({
      legs: legs.map((l) => ({
        betId: l.betId,
        fixtureId: l.fixtureId,
        label: l.label,
        pickOutcomeId: l.pickOutcomeId,
        odds: l.odds ?? null,
      })),
      stake: stakeNum,
      idempotencyKey: makeIdempotencyKey(),
    });
    const slipId = (res as { slipId?: string })?.slipId;
    if (slipId) router.replace(`/play/parlay/${slipId}`);
    else router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Current slip */}
        <Card raised className="gap-3">
          <View className="flex-row items-center justify-between">
            <Txt variant="heading">Your slip</Txt>
            <MultiplierBadge multiplier={legs.length >= 1 ? multiplier : 1} />
          </View>

          {legs.length === 0 ? (
            <Txt variant="caption" muted>
              Add at least 2 legs below. Every leg must hit for the slip to pay.
            </Txt>
          ) : (
            <View>
              {legs.map((l) => (
                <ParlayLegRow key={l.key} leg={l} onRemove={() => removeLeg(l.key)} />
              ))}
            </View>
          )}

          <Input
            label="Stake (Chips)"
            value={stake}
            onChangeText={setStake}
            keyboardType="number-pad"
            prefix="🪙"
          />

          <View className="flex-row items-center justify-between border-t border-hairline pt-3">
            <Txt variant="label" dim>
              Potential payout
            </Txt>
            <Txt variant="heading" className="text-gold" style={{ fontVariant: ['tabular-nums'] }}>
              {formatChips(legs.length >= 2 ? potential : 0)}
            </Txt>
          </View>
        </Card>

        {/* Leg sources */}
        <SegmentedTabs tabs={SOURCES as unknown as string[]} value={source} onChange={(t) => setSource(t as Source)} />

        {source === 'Open bets' ? (
          <View className="gap-3">
            {(bets ?? []).length === 0 ? (
              <Txt variant="caption" muted>
                No open bets to add right now.
              </Txt>
            ) : null}
            {(bets ?? []).map((bet) => (
              <Card key={bet.betId}>
                <Txt variant="label" numberOfLines={2} className="mb-2">
                  {bet.title}
                </Txt>
                <View className="flex-row flex-wrap gap-2">
                  {bet.outcomes.map((o) => {
                    const key = `bet:${bet.betId}:${o.id}`;
                    const added = hasLeg((l) => l.key === key);
                    return (
                      <Pressable
                        key={o.id}
                        disabled={added || legs.length >= MAX_LEGS}
                        onPress={() =>
                          addLeg({
                            key,
                            label: `${bet.title} — ${o.label}`,
                            betId: bet.betId,
                            fixtureId: null,
                            pickOutcomeId: o.id,
                            odds: o.odds ?? null,
                          })
                        }
                        className={`rounded-pill border px-3 py-2 ${
                          added ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface-raised'
                        }`}
                      >
                        <Txt variant="label" className={added ? 'text-jade' : 'text-text-dim'}>
                          {added ? '✓ ' : ''}
                          {o.label}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <View className="gap-3">
            {(fixtures ?? []).length === 0 ? (
              <Txt variant="caption" muted>
                No upcoming fixtures to add.
              </Txt>
            ) : null}
            {(fixtures ?? []).map((f) => (
              <Card key={f.fixtureId}>
                <View className="mb-2 flex-row items-center justify-between">
                  <Txt variant="label" numberOfLines={1}>
                    {f.homeTeam} vs {f.awayTeam}
                  </Txt>
                  <Pill label={f.league} tone="muted" />
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {(['home', 'away', 'draw'] as const).map((pick) => {
                    const key = `fix:${f.fixtureId}:${pick}`;
                    const added = hasLeg((l) => l.key === key);
                    const pickLabel = pick === 'home' ? f.homeTeam : pick === 'away' ? f.awayTeam : 'Draw';
                    return (
                      <Pressable
                        key={pick}
                        disabled={added || legs.length >= MAX_LEGS}
                        onPress={() =>
                          addLeg({
                            key,
                            label: `${f.homeTeam} vs ${f.awayTeam} — ${pickLabel}`,
                            betId: null,
                            fixtureId: f.fixtureId,
                            pickOutcomeId: pick,
                            odds: null,
                          })
                        }
                        className={`rounded-pill border px-3 py-2 ${
                          added ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface-raised'
                        }`}
                      >
                        <Txt variant="label" className={added ? 'text-jade' : 'text-text-dim'}>
                          {added ? '✓ ' : ''}
                          {pickLabel}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ))}
          </View>
        )}

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>

      <View className="border-t border-hairline px-4 pb-6 pt-3">
        <Button
          label={`Place parlay · ${formatChips(legs.length >= 2 ? potential : 0)} to win`}
          tone="gold"
          onPress={submit}
          loading={createParlay.isPending}
          disabled={!canSubmit}
        />
        {legs.length < 2 ? (
          <Txt variant="caption" muted className="mt-2 text-center" style={{ color: colors.textFaint }}>
            Add at least 2 legs to place a parlay.
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}
