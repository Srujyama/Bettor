/**
 * StakeSlider — pick a stake. A draggable track (gesture-handler Pan), a −/+
 * stepper, and CHIP_DENOMINATIONS quick-chips. Clamps to [min, max] and to the
 * caller-supplied balance so a user can never select more than they hold. When
 * poolByOutcome + outcomeId are provided it shows a non-authoritative payout
 * preview via previewPayout(). Presentational: value/onChange owned by caller.
 */
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { CHIP_DENOMINATIONS } from '@/shared/constants';
import { formatChips, previewPayout } from '@/shared/money';

interface Props {
  /** The user's spendable Chip balance — hard ceiling on the slider. */
  balance: number;
  min: number;
  max: number;
  value: number;
  onChange: (stake: number) => void;
  /** Optional: enables the payout preview. */
  poolByOutcome?: Record<string, number>;
  outcomeId?: string | null;
  className?: string;
}

const KNOB = 28;
const TRACK_H = 8;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function StakeSlider({
  balance,
  min,
  max,
  value,
  onChange,
  poolByOutcome,
  outcomeId,
  className = '',
}: Props) {
  const [trackW, setTrackW] = useState(0);
  // Effective ceiling: never above balance.
  const hi = Math.max(min, Math.min(max, balance));
  const span = Math.max(1, hi - min);
  const pct = clamp((value - min) / span, 0, 1);

  const knobX = useSharedValue(0);
  const dragging = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackW(w);
    knobX.value = clamp((value - min) / span, 0, 1) * Math.max(0, w - KNOB);
  };

  const commit = (px: number) => {
    if (trackW <= 0) return;
    const usable = Math.max(1, trackW - KNOB);
    const ratio = clamp(px / usable, 0, 1);
    const raw = min + ratio * span;
    const next = clamp(Math.round(raw), min, hi);
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      dragging.value = withSpring(1, { damping: 14 });
    })
    .onChange((e) => {
      const usable = Math.max(1, trackW - KNOB);
      knobX.value = clamp(knobX.value + e.changeX, 0, usable);
      runOnJS(commit)(knobX.value);
    })
    .onFinalize(() => {
      dragging.value = withSpring(0, { damping: 14 });
    });

  // Keep the knob synced to the controlled value when it changes externally
  // (e.g. via a quick-chip) and we're not actively dragging.
  const usable = Math.max(0, trackW - KNOB);
  const targetX = pct * usable;

  const knobStyle = useAnimatedStyle(() => {
    const x = dragging.value > 0 ? knobX.value : withSpring(targetX, { damping: 18, stiffness: 200 });
    return {
      transform: [
        { translateX: x },
        { scale: withSpring(1 + dragging.value * 0.15, { damping: 14 }) },
      ],
    };
  });

  const fillStyle = useAnimatedStyle(() => {
    const x = dragging.value > 0 ? knobX.value : withSpring(targetX, { damping: 18, stiffness: 200 });
    return { width: x + KNOB / 2 };
  });

  // The +/- increment. NOT `min` (which can be 0 → dead buttons, or huge → jumps):
  // a round step scaled to the range, at least 10 Chips.
  const stepBy = Math.max(10, Math.round((hi - min) / 20 / 10) * 10 || 10);

  const step = (delta: number) => {
    const next = clamp(value + delta, min, hi);
    if (next !== value) {
      Haptics.selectionAsync();
      onChange(next);
    }
  };

  const setChip = (amount: number) => {
    const next = clamp(amount, min, hi);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  };

  const preview =
    poolByOutcome && outcomeId
      ? previewPayout(poolByOutcome, outcomeId, value)
      : null;

  return (
    <View className={`gap-4 ${className}`}>
      {/* Current stake */}
      <View className="items-center gap-1">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Your stake
        </Txt>
        <ChipCounter value={value} size={44} color={colors.jade} />
        <Txt variant="caption" muted>
          Balance {formatChips(balance)} Chips
        </Txt>
      </View>

      {/* Stepper + track */}
      <View className="flex-row items-center gap-3">
        <Stepper label="−" onPress={() => step(-stepBy)} disabled={value <= min} />
        <View className="flex-1 justify-center" style={{ height: KNOB }}>
          <View
            onLayout={onLayout}
            style={{
              height: TRACK_H,
              borderRadius: TRACK_H / 2,
              backgroundColor: colors.surfaceSunken,
              justifyContent: 'center',
            }}
          >
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  height: TRACK_H,
                  borderRadius: TRACK_H / 2,
                  backgroundColor: colors.jade,
                },
                fillStyle,
              ]}
            />
            <GestureDetector gesture={pan}>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: -(KNOB - TRACK_H) / 2,
                    width: KNOB,
                    height: KNOB,
                    borderRadius: KNOB / 2,
                    backgroundColor: colors.jade,
                    borderWidth: 3,
                    borderColor: colors.ink,
                  },
                  knobStyle,
                ]}
              />
            </GestureDetector>
          </View>
        </View>
        <Stepper label="+" onPress={() => step(stepBy)} disabled={value >= hi} />
      </View>

      {/* Quick chips */}
      <View className="flex-row flex-wrap gap-2">
        {CHIP_DENOMINATIONS.filter((d) => d <= hi).map((d) => {
          const active = value === d;
          return (
            <Pressable
              key={d}
              onPress={() => setChip(d)}
              className={`rounded-pill border px-3 py-1.5 ${
                active ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface-raised'
              }`}
            >
              <Txt variant="label" className={active ? 'text-jade' : 'text-text-dim'}>
                {formatChips(d)}
              </Txt>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setChip(hi)}
          className="rounded-pill border border-gold/50 bg-gold/10 px-3 py-1.5"
        >
          <Txt variant="label" className="text-gold">
            Max
          </Txt>
        </Pressable>
      </View>

      {/* Payout preview (non-authoritative) */}
      {preview ? (
        <View className="flex-row items-center justify-between rounded-chip border border-hairline bg-surface-sunken px-4 py-3">
          <View>
            <Txt variant="caption" muted>
              If you win
            </Txt>
            <Txt variant="heading" style={{ color: colors.jade }}>
              {formatChips(preview.estPayout)}
            </Txt>
          </View>
          <View className="items-end">
            <Txt variant="caption" muted>
              Profit
            </Txt>
            <Txt variant="label" style={{ color: preview.estProfit >= 0 ? colors.jade : colors.coral }}>
              {preview.estProfit >= 0 ? '+' : '−'}
              {formatChips(Math.abs(preview.estProfit))} · {preview.impliedMultiplier.toFixed(2)}×
            </Txt>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Stepper({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="h-10 w-10 items-center justify-center rounded-full border border-hairline bg-surface-raised"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Txt variant="heading" className="text-text">
        {label}
      </Txt>
    </Pressable>
  );
}
