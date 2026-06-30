/**
 * BuyInStepper — pick a buy-in / rebuy amount. A big tabular value with −/+
 * steppers and quick chips (½×, 1×, 2× the default buy-in). Controlled: the
 * parent owns the value. Presentational only; the actual escrow happens on the
 * server when the screen calls the buy-in callable.
 */
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';

interface Props {
  value: number;
  onChange: (next: number) => void;
  /** Step for the −/+ buttons (defaults to a sensible chip denomination). */
  step?: number;
  min?: number;
  max?: number;
  /** The session's suggested buy-in — drives the quick-pick chips. */
  defaultBuyIn?: number;
}

function StepButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.hairline,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Txt style={{ fontSize: 24, color: colors.text, fontWeight: '700' }}>{label}</Txt>
    </Pressable>
  );
}

export function BuyInStepper({ value, onChange, step = 25, min = 0, max = 1_000_000, defaultBuyIn }: Props) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const quick = defaultBuyIn && defaultBuyIn > 0
    ? [
        { label: '½×', amount: clamp(defaultBuyIn / 2) },
        { label: '1×', amount: clamp(defaultBuyIn) },
        { label: '2×', amount: clamp(defaultBuyIn * 2) },
      ]
    : [];

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <StepButton label="−" onPress={() => onChange(clamp(value - step))} disabled={value <= min} />
        <View className="items-center">
          <Txt
            style={{ fontSize: 40, color: colors.text, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] }}
          >
            {formatChips(value)}
          </Txt>
          <Txt variant="caption" muted>
            Chips
          </Txt>
        </View>
        <StepButton label="+" onPress={() => onChange(clamp(value + step))} disabled={value >= max} />
      </View>

      {quick.length > 0 ? (
        <View className="flex-row justify-center gap-2">
          {quick.map((q) => {
            const active = q.amount === value;
            return (
              <Pressable
                key={q.label}
                onPress={() => onChange(q.amount)}
                className={`rounded-pill border px-4 py-2 ${active ? 'border-jade/60 bg-jade/15' : 'border-hairline bg-surface'}`}
              >
                <Txt variant="caption" className={active ? 'text-jade font-semibold' : 'text-text-dim'}>
                  {q.label} · {formatChips(q.amount)}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
