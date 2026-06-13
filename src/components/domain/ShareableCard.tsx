/**
 * ShareableCard — the beautiful, screenshot-able card captured with
 * react-native-view-shot (the caller holds the ref) and shared via expo-sharing.
 * One component renders four card "types": a bet result, a stat flex, a
 * leaderboard standing, or a Wrapped slide. Foil border, big hero numeral, the
 * Chipd wordmark, and the mandatory "no cash value" microcopy on every variant.
 *
 * Presentational: everything comes in via the discriminated `data` prop. The
 * fixed aspect makes the captured image consistent across share targets.
 */
import { forwardRef } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ChipCounter, Txt } from '@/components/ui';
import { colors, gradients } from '@/theme';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

export type ShareCardType = 'bet_result' | 'stat_flex' | 'leaderboard' | 'wrapped';

export interface BetResultCardData {
  type: 'bet_result';
  won: boolean;
  title: string;
  amount: number; // payout or stake lost
  playerName?: string;
}
export interface StatFlexCardData {
  type: 'stat_flex';
  statLabel: string;
  statValue: string;
  playerName?: string;
  subtitle?: string;
}
export interface LeaderboardCardData {
  type: 'leaderboard';
  rank: number;
  scopeLabel: string; // e.g. "Season 3" or "Friends"
  netChips: number;
  playerName?: string;
}
export interface WrappedCardData {
  type: 'wrapped';
  periodLabel: string;
  headline: string; // e.g. "+24,500 net"
  lines: { label: string; value: string }[];
  playerName?: string;
}

export type ShareCardData =
  | BetResultCardData
  | StatFlexCardData
  | LeaderboardCardData
  | WrappedCardData;

interface Props {
  data: ShareCardData;
  /** Fixed capture width (height is derived). */
  width?: number;
}

const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

export const ShareableCard = forwardRef<View, Props>(function ShareableCard({ data, width = 320 }, ref) {
  const accent =
    data.type === 'bet_result'
      ? data.won
        ? colors.jade
        : colors.coral
      : data.type === 'leaderboard'
        ? colors.gold
        : colors.jade;

  return (
    <View ref={ref} collapsable={false} style={{ width }}>
      <LinearGradient
        colors={gradients.foil}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 26, padding: 1.5 }}
      >
        <LinearGradient
          colors={gradients.ink}
          style={{ borderRadius: 25, padding: 24, gap: 16, minHeight: width * 1.2 }}
        >
          {/* Wordmark */}
          <View className="flex-row items-center justify-between">
            <Txt variant="heading" style={{ color: colors.gold, letterSpacing: 1 }}>
              CHIPD
            </Txt>
            {data.playerName ? (
              <Txt variant="caption" muted numberOfLines={1}>
                {data.playerName}
              </Txt>
            ) : null}
          </View>

          {/* Body per type */}
          <View className="flex-1 items-center justify-center gap-3">
            {data.type === 'bet_result' ? (
              <>
                <Txt variant="title" style={{ color: accent }}>
                  {data.won ? 'WON' : 'LOST'}
                </Txt>
                <Txt variant="heading" numberOfLines={3} className="text-center">
                  {data.title}
                </Txt>
                <ChipCounter
                  value={data.amount}
                  size={48}
                  color={accent}
                  prefix={data.won ? '+' : '−'}
                />
              </>
            ) : data.type === 'stat_flex' ? (
              <>
                <Txt variant="caption" muted className="uppercase tracking-widest">
                  {data.statLabel}
                </Txt>
                <Txt variant="display" style={{ color: accent }}>
                  {data.statValue}
                </Txt>
                {data.subtitle ? (
                  <Txt variant="body" dim className="text-center">
                    {data.subtitle}
                  </Txt>
                ) : null}
              </>
            ) : data.type === 'leaderboard' ? (
              <>
                <Txt variant="caption" muted className="uppercase tracking-widest">
                  {data.scopeLabel}
                </Txt>
                <Txt variant="display" style={{ color: colors.gold }}>
                  {ORDINAL(data.rank)}
                </Txt>
                <ChipCounter
                  value={Math.abs(data.netChips)}
                  size={32}
                  color={data.netChips >= 0 ? colors.jade : colors.coral}
                  prefix={data.netChips >= 0 ? '+' : '−'}
                />
              </>
            ) : (
              <>
                <Txt variant="caption" muted className="uppercase tracking-widest">
                  {data.periodLabel} · Wrapped
                </Txt>
                <Txt variant="title" style={{ color: accent }} className="text-center">
                  {data.headline}
                </Txt>
                <View className="mt-2 w-full gap-1.5">
                  {data.lines.map((l) => (
                    <View key={l.label} className="flex-row items-baseline justify-between">
                      <Txt variant="caption" muted>
                        {l.label}
                      </Txt>
                      <Txt variant="label">{l.value}</Txt>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>

          <Txt variant="caption" muted className="text-center">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </LinearGradient>
      </LinearGradient>
    </View>
  );
});
