/**
 * QuickBetSheet — a bottom sheet to join a P2P bet from the feed in 1–2 taps:
 * pick an outcome, pick a stake step, confirm. The server escrows the stake and
 * the live read hooks reflect the new pool; this sheet computes nothing about
 * money beyond display. Controlled via an imperative ref.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Button, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE, STAKE } from '@/shared/constants';
import { useQuickJoin } from '@/features/feed/hooks';
import type { Bet } from '@/shared/schemas';

export interface QuickBetSheetRef {
  present: (bet: Bet) => void;
  dismiss: () => void;
}

const STAKE_STEPS = [STAKE.MIN, 100, 250, 500] as const;

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

export const QuickBetSheet = forwardRef<QuickBetSheetRef>(function QuickBetSheet(_props, ref) {
  const sheet = useRef<BottomSheetModal>(null);
  const [bet, setBet] = useState<Bet | null>(null);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [stake, setStake] = useState<number>(STAKE.MIN);
  const join = useQuickJoin();

  useImperativeHandle(ref, () => ({
    present: (b) => {
      setBet(b);
      setOutcomeId(b.outcomes[0]?.id ?? null);
      const fixed = b.stakeMode === 'fixed' && b.fixedStakeAmount != null ? b.fixedStakeAmount : null;
      setStake(fixed ?? (b.minStake ?? STAKE.MIN));
      sheet.current?.present();
    },
    dismiss: () => sheet.current?.dismiss(),
  }));

  const fixedStake = bet?.stakeMode === 'fixed' && bet.fixedStakeAmount != null ? bet.fixedStakeAmount : null;

  const confirm = () => {
    if (!bet || !outcomeId) return;
    join.mutate(
      { betId: bet.betId, outcomeId, stake },
      { onSuccess: () => sheet.current?.dismiss() },
    );
  };

  return (
    <BottomSheetModal
      ref={sheet}
      enableDynamicSizing
      backdropComponent={Backdrop}
      handleIndicatorStyle={{ backgroundColor: colors.faint }}
      backgroundStyle={{ backgroundColor: colors.surface }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: 36, paddingTop: 8 }}>
        {bet && (
          <View className="gap-4">
            <Txt variant="heading" numberOfLines={3}>
              {bet.title}
            </Txt>

            <View className="gap-2">
              <Txt variant="caption" muted className="uppercase tracking-widest">
                Your side
              </Txt>
              <View className="gap-2">
                {bet.outcomes.map((o) => {
                  const active = o.id === outcomeId;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => setOutcomeId(o.id)}
                      className={`flex-row items-center justify-between rounded-card border px-4 py-3 ${
                        active ? 'border-jade bg-jade/10' : 'border-hairline bg-surface-raised'
                      }`}
                    >
                      <Txt variant="body" className={active ? 'text-jade' : 'text-text'}>
                        {o.label}
                      </Txt>
                      <Txt variant="caption" muted>
                        {formatChips(bet.poolByOutcome[o.id] ?? 0)} in
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="gap-2">
              <Txt variant="caption" muted className="uppercase tracking-widest">
                Stake
              </Txt>
              {fixedStake != null ? (
                <View className="rounded-card border border-hairline bg-surface-raised px-4 py-3">
                  <Txt variant="body">Fixed stake · {formatChips(fixedStake)} Chips</Txt>
                </View>
              ) : (
                <View className="flex-row gap-2">
                  {STAKE_STEPS.map((s) => (
                    <View key={s} className="flex-1">
                      <Button
                        label={formatChips(s)}
                        tone={stake === s ? 'jade' : 'ghost'}
                        size="sm"
                        onPress={() => setStake(s)}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Button
              label={`Join for ${formatChips(stake)}`}
              tone="jade"
              size="lg"
              loading={join.isPending}
              disabled={!outcomeId}
              onPress={confirm}
            />

            <Txt variant="caption" muted className="text-center">
              {NO_CASH_VALUE_DISCLOSURE}
            </Txt>
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
