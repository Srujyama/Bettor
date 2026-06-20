/**
 * QuickTradeSheet — a bottom sheet to buy YES/NO shares in a prediction market
 * in 1–2 taps without leaving the feed. Shows a live LMSR price preview (client
 * math from `@/shared/markets` — for display only; the server is authoritative),
 * a budget stepper, and a confirm button that calls the quick-trade mutation.
 *
 * Controlled via an imperative ref: parents call `present(market, side)`.
 */
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Button, ChipCounter, Pill, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { quoteBuy, priceCents, type MarketSide } from '@/shared/markets';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { useQuickTrade } from '@/features/feed/hooks';
import type { Market } from '@/shared/schemas-markets';

export interface QuickTradeSheetRef {
  present: (market: Market, side: MarketSide) => void;
  dismiss: () => void;
}

const BUDGET_STEPS = [50, 100, 250, 500] as const;

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />;
}

export const QuickTradeSheet = forwardRef<QuickTradeSheetRef>(function QuickTradeSheet(_props, ref) {
  const sheet = useRef<BottomSheetModal>(null);
  const [market, setMarket] = useState<Market | null>(null);
  const [side, setSide] = useState<MarketSide>('yes');
  const [budget, setBudget] = useState<number>(100);
  const trade = useQuickTrade();

  useImperativeHandle(ref, () => ({
    present: (m, s) => {
      setMarket(m);
      setSide(s);
      setBudget(100);
      sheet.current?.present();
    },
    dismiss: () => sheet.current?.dismiss(),
  }));

  // Live price preview from the AMM state (display only).
  const preview = useMemo(() => {
    if (!market) return null;
    const state = { qYes: market.qYes ?? 0, qNo: market.qNo ?? 0, b: market.b };
    const quote = quoteBuy(state, side, budget);
    return {
      priceNow: priceCents(state, side),
      shares: quote.shares,
      cost: quote.cost,
      avgPriceCents: quote.avgPriceCents,
      potentialPayout: quote.potentialPayout,
    };
  }, [market, side, budget]);

  const tone = side === 'yes' ? 'jade' : 'coral';

  const confirm = () => {
    if (!market) return;
    trade.mutate(
      { marketId: market.marketId, side, budget },
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
        {market && (
          <View className="gap-4">
            <View className="gap-2">
              <Pill label={side === 'yes' ? 'Buying YES' : 'Buying NO'} tone={tone} />
              <Txt variant="heading" numberOfLines={3}>
                {market.question}
              </Txt>
            </View>

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  label={`YES ${priceCents({ qYes: market.qYes ?? 0, qNo: market.qNo ?? 0, b: market.b }, 'yes')}¢`}
                  tone={side === 'yes' ? 'jade' : 'ghost'}
                  size="md"
                  onPress={() => setSide('yes')}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={`NO ${priceCents({ qYes: market.qYes ?? 0, qNo: market.qNo ?? 0, b: market.b }, 'no')}¢`}
                  tone={side === 'no' ? 'coral' : 'ghost'}
                  size="md"
                  onPress={() => setSide('no')}
                />
              </View>
            </View>

            <View className="gap-2">
              <Txt variant="caption" muted className="uppercase tracking-widest">
                Budget
              </Txt>
              <View className="flex-row gap-2">
                {BUDGET_STEPS.map((b) => (
                  <View key={b} className="flex-1">
                    <Button
                      label={formatChips(b)}
                      tone={budget === b ? (tone as 'jade' | 'coral') : 'ghost'}
                      size="sm"
                      onPress={() => setBudget(b)}
                    />
                  </View>
                ))}
              </View>
            </View>

            {preview && (
              <View className="gap-2 rounded-card border border-hairline bg-surface-raised p-4">
                <View className="flex-row items-center justify-between">
                  <Txt variant="caption" muted>
                    Shares (est.)
                  </Txt>
                  <Txt variant="body">{formatChips(preview.shares)}</Txt>
                </View>
                <View className="flex-row items-center justify-between">
                  <Txt variant="caption" muted>
                    Avg price
                  </Txt>
                  <Txt variant="body">{preview.avgPriceCents}¢</Txt>
                </View>
                <View className="flex-row items-center justify-between border-t border-hairline pt-2">
                  <Txt variant="caption" muted>
                    Pays if right
                  </Txt>
                  <ChipCounter value={preview.potentialPayout} size={20} color={colors.gold} />
                </View>
              </View>
            )}

            <Button
              label={`Buy ${side.toUpperCase()} for ${formatChips(budget)}`}
              tone={tone as 'jade' | 'coral'}
              size="lg"
              loading={trade.isPending}
              disabled={!preview || preview.shares <= 0}
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
