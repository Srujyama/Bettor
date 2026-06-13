/**
 * ResultCard — the shareable, screenshot-able card for a settled bet. Designed
 * to be captured with react-native-view-shot (the caller holds the ref). Foil
 * border, a big WON / LOST verdict, the pot, the Chipd wordmark, and the
 * mandatory "no cash value" microcopy. Presentational: bet + settlement in via
 * props. The viewer's perspective (won/lost) is derived from `myUid` if given,
 * else falls back to "the winning side" framing.
 */
import { forwardRef } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChipCounter, Txt } from '@/components/ui';
import { colors, gradients } from '@/theme';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import type { Bet, Settlement } from '@/shared/schemas';

interface Props {
  bet: Bet;
  settlement: Settlement;
  /** Display names of the winning participants (for the subtitle). */
  winnerNames: string[];
  /** When provided, frames the card from this user's outcome (WON / LOST). */
  myUid?: string;
}

export const ResultCard = forwardRef<View, Props>(function ResultCard(
  { bet, settlement, winnerNames, myUid },
  ref,
) {
  const winningOutcome = bet.outcomes.find((o) => o.id === settlement.winningOutcomeId);
  const refunded = settlement.model === 'REFUND_ALL';

  const myPayout = myUid ? settlement.payouts.find((p) => p.uid === myUid) : undefined;
  const myProfit = myPayout?.profit ?? 0;
  // From the viewer's perspective when we know who they are; else neutral.
  const won = myUid ? !!myPayout && myProfit >= 0 && !refunded : !refunded;

  const verdict = refunded ? 'VOID' : won ? 'WON' : 'LOST';
  const verdictColor = refunded ? colors.void : won ? colors.jade : colors.coral;

  const winnerLabel =
    winnerNames.length === 0
      ? '—'
      : winnerNames.length <= 2
        ? winnerNames.join(' & ')
        : `${winnerNames[0]} +${winnerNames.length - 1} more`;

  return (
    <View ref={ref} collapsable={false} style={{ width: 320 }}>
      <LinearGradient
        colors={gradients.foil}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 24, padding: 2 }}
      >
        <View
          style={{
            borderRadius: 22,
            backgroundColor: colors.ink,
            padding: 24,
            gap: 16,
          }}
        >
          {/* Wordmark */}
          <View className="flex-row items-center justify-between">
            <Txt variant="heading" style={{ color: colors.gold, letterSpacing: 1 }}>
              CHIPD
            </Txt>
            <Txt variant="caption" muted className="uppercase tracking-widest">
              Result
            </Txt>
          </View>

          {/* Title */}
          <Txt variant="heading" numberOfLines={3}>
            {bet.title}
          </Txt>

          {/* Verdict */}
          <View className="items-center gap-1 py-2">
            <Txt
              variant="display"
              style={{ color: verdictColor, fontSize: 64, lineHeight: 68 }}
            >
              {verdict}
            </Txt>
            {!refunded && winningOutcome ? (
              <Txt variant="label" dim>
                Winner: {winningOutcome.label}
              </Txt>
            ) : null}
          </View>

          {/* Pot */}
          <View className="items-center gap-1 rounded-card border border-hairline bg-surface px-4 py-4">
            <Txt variant="caption" muted className="uppercase tracking-widest">
              Total pot
            </Txt>
            <ChipCounter value={settlement.pool} size={40} color={colors.gold} />
            <Txt variant="caption" dim>
              {winnerLabel}
              {!refunded ? ` · ${formatChips(settlement.payoutTotal)} paid out` : ' · refunded'}
            </Txt>
          </View>

          {/* Microcopy */}
          <Txt variant="caption" muted className="text-center">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </View>
      </LinearGradient>
    </View>
  );
});
