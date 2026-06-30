/**
 * OddsStepper — pick decimal odds with +/- controls, showing the implied
 * probability and a fractional ("2:1") read-out so makers can price an offer the
 * way they'd say it out loud. Steps adapt to the magnitude (fine near evens,
 * coarser at long odds) and clamp to [MIN_DECIMAL_ODDS, MAX_DECIMAL_ODDS].
 *
 * Presentational: the chosen decimal value is owned by the caller via onChange.
 */
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import {
  MIN_DECIMAL_ODDS,
  MAX_DECIMAL_ODDS,
  assertOdds,
  impliedProbability,
  toFractional,
} from '@/shared/fixedodds';

interface Props {
  value: number;
  onChange: (decimal: number) => void;
  disabled?: boolean;
}

/** Step size by magnitude — tighter near evens, looser at the tails. */
function stepFor(decimal: number): number {
  if (decimal < 2) return 0.05;
  if (decimal < 5) return 0.1;
  if (decimal < 10) return 0.5;
  return 1;
}

function clampOdds(d: number): number {
  const rounded = Math.round(d * 100) / 100;
  return Math.min(MAX_DECIMAL_ODDS, Math.max(MIN_DECIMAL_ODDS, rounded));
}

export function OddsStepper({ value, onChange, disabled }: Props) {
  const safe = (() => {
    try {
      assertOdds(value);
      return value;
    } catch {
      return 2.0;
    }
  })();

  const impliedPct = Math.round(impliedProbability(safe) * 100);
  const fractional = toFractional(safe);

  const bump = (dir: 1 | -1) => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const step = stepFor(safe);
    onChange(clampOdds(safe + dir * step));
  };

  const atMin = safe <= MIN_DECIMAL_ODDS + 1e-9;
  const atMax = safe >= MAX_DECIMAL_ODDS - 1e-9;

  return (
    <View className="gap-2 rounded-card border border-hairline bg-surface p-4">
      <Txt variant="label" dim className="uppercase tracking-widest">
        Your odds (decimal)
      </Txt>
      <View className="flex-row items-center justify-between">
        <StepButton glyph="−" onPress={() => bump(-1)} disabled={disabled || atMin} />
        <View className="items-center">
          <Txt variant="display" className="font-mono" style={{ color: colors.gold }}>
            {safe.toFixed(2)}
          </Txt>
          <Txt variant="caption" muted>
            {fractional} · {impliedPct}% implied
          </Txt>
        </View>
        <StepButton glyph="+" onPress={() => bump(1)} disabled={disabled || atMax} />
      </View>
    </View>
  );
}

function StepButton({
  glyph,
  onPress,
  disabled,
}: {
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="h-12 w-12 items-center justify-center rounded-pill border border-hairline bg-surface-raised"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Txt variant="title" style={{ color: colors.text }}>
        {glyph}
      </Txt>
    </Pressable>
  );
}
