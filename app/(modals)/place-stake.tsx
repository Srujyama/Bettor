/**
 * PLACE STAKE — a sheet-style modal. Params: ?betId & optional ?outcomeId.
 * Shows the OutcomePicker, a StakeSlider with a live (non-authoritative) payout
 * preview, and a HoldToConfirm. If the user enabled the biometric gate we
 * authenticate before sending. The mutation only calls fns.placeBet — server
 * state flows back through the live read hooks. No-cash-value microcopy is shown.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { toast } from '@/lib/toast';
import { Pill, Screen, Txt } from '@/components/ui';
import { HoldToConfirm, OutcomePicker, StakeSlider } from '@/components/domain';
import { usePlaceBet } from '@/features/bets/mutations';
import { useBet, useCurrentUser } from '@/hooks/data';
import { useUi } from '@/stores/ui';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { makeIdempotencyKey } from '@/shared/ids';
import { previewPayout, formatChips } from '@/shared/money';

export default function PlaceStakeModal() {
  const params = useLocalSearchParams<{ betId?: string; outcomeId?: string }>();
  const betId = params.betId ?? null;

  const { data: bet } = useBet(betId);
  const { data: me } = useCurrentUser();
  const placeBet = usePlaceBet();

  const stakeDraft = useUi((s) => s.stakeDraft);
  const setStakeDraft = useUi((s) => s.setStakeDraft);

  const [outcomeId, setOutcomeId] = useState<string | null>(params.outcomeId ?? null);

  const balance = me?.chipsBalance ?? 0;
  const min = bet?.minStake ?? STAKE.MIN;
  const max = bet?.maxStake ?? STAKE.DEFAULT_MAX;
  const fixed = bet?.stakeMode === 'fixed';
  const stake = fixed ? bet?.fixedStakeAmount ?? min : Math.max(min, Math.min(max, balance, stakeDraft));

  // Clamp the draft into range once the bet loads.
  useEffect(() => {
    if (!bet) return;
    if (fixed) return;
    const clamped = Math.max(min, Math.min(max, balance, stakeDraft || min));
    if (clamped !== stakeDraft) setStakeDraft(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet]);

  const preview = useMemo(() => {
    if (!bet || !outcomeId) return null;
    return previewPayout(bet.poolByOutcome, outcomeId, stake);
  }, [bet, outcomeId, stake]);

  if (!bet) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" dim>
            Loading bet…
          </Txt>
        </View>
      </Screen>
    );
  }

  const insufficient = stake > balance;
  const canConfirm = !!outcomeId && stake >= min && !insufficient && !placeBet.isPending;

  const confirm = async () => {
    if (!betId || !outcomeId) return;

    if (me?.settings?.biometricGate) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && enrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm your stake',
        });
        if (!result.success) {
          toast({ title: 'Confirmation failed', preset: 'error', haptic: 'error' });
          return;
        }
      }
    }

    try {
      await placeBet.mutateAsync({
        betId,
        outcomeId,
        stake,
        idempotencyKey: makeIdempotencyKey(),
      });
      router.back();
    } catch {
      // toast already surfaced by the mutation's onError
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="gap-1">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Place a stake
          </Txt>
          <Txt variant="heading" numberOfLines={2}>
            {bet.title}
          </Txt>
        </View>

        <View className="gap-2">
          <Txt variant="label" dim>
            Your side
          </Txt>
          <OutcomePicker
            outcomes={bet.outcomes}
            value={outcomeId}
            onChange={setOutcomeId}
            poolByOutcome={bet.poolByOutcome}
          />
        </View>

        {fixed ? (
          <View className="items-center gap-2 rounded-card border border-hairline bg-surface p-5">
            <Txt variant="caption" muted className="uppercase tracking-widest">
              Fixed stake
            </Txt>
            <Txt variant="title" className="text-jade">
              {formatChips(stake)} Chips
            </Txt>
            <Txt variant="caption" muted>
              Balance {formatChips(balance)} Chips
            </Txt>
            {preview ? (
              <Pill label={`If you win · ${formatChips(preview.estPayout)} Chips`} tone="jade" />
            ) : null}
          </View>
        ) : (
          <StakeSlider
            balance={balance}
            min={min}
            max={max}
            value={stake}
            onChange={setStakeDraft}
            poolByOutcome={bet.poolByOutcome}
            outcomeId={outcomeId}
          />
        )}

        {insufficient ? (
          <Pill label="Not enough Chips for this stake" tone="coral" />
        ) : null}

        <View className="items-center gap-3 pt-2">
          <HoldToConfirm
            label={outcomeId ? 'Hold to stake' : 'Pick a side'}
            tone="jade"
            disabled={!canConfirm}
            onConfirm={confirm}
          />
          <Txt variant="caption" muted className="text-center">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}
