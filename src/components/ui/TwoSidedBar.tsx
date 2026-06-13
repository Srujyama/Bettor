/**
 * The signature "me vs them" split bar. Renders the pool distribution across
 * outcomes as a single animated bar — jade for the leading/your side, coral for
 * the other, gold/royal for additional outcomes. Springs as the pool shifts.
 */
import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Txt } from './Text';
import { colors } from '@/theme';
import { formatChipsCompact } from '@/shared/money';

const PALETTE = [colors.jade, colors.coral, colors.gold, colors.royal, colors.muted];

interface Segment {
  outcomeId: string;
  label: string;
  amount: number;
}

interface Props {
  segments: Segment[];
  /** outcomeId the current user backed, to emphasize. */
  mySide?: string | null;
  height?: number;
  showLabels?: boolean;
}

export function TwoSidedBar({ segments, mySide, height = 12, showLabels = true }: Props) {
  const total = Math.max(1, segments.reduce((s, seg) => s + seg.amount, 0));

  return (
    <View className="gap-2">
      <View
        style={{ height, borderRadius: height / 2, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.surfaceSunken }}
      >
        {segments.map((seg, i) => {
          const pct = seg.amount / total;
          return <Bar key={seg.outcomeId} pct={pct} color={PALETTE[i % PALETTE.length]} />;
        })}
      </View>
      {showLabels ? (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          {segments.map((seg, i) => {
            const pct = Math.round((seg.amount / total) * 100);
            const mine = mySide === seg.outcomeId;
            return (
              <View key={seg.outcomeId} className="flex-row items-center gap-1.5">
                <View
                  style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                <Txt variant="caption" className={mine ? 'font-bold text-text' : 'text-text-dim'}>
                  {seg.label} · {formatChipsCompact(seg.amount)} ({pct}%)
                  {mine ? ' · you' : ''}
                </Txt>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  const style = useAnimatedStyle(() => ({
    flex: withSpring(Math.max(0.0001, pct), { damping: 18, stiffness: 120 }),
  }));
  return <Animated.View style={[{ backgroundColor: color, height: '100%' }, style]} />;
}
