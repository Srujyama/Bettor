/**
 * OutcomePicker — a segmented selector over a bet's outcomes. Each side gets a
 * brand color by index (jade / coral / gold / royal …) and the selected side
 * scales up with a subtle spring. When poolByOutcome is supplied it shows the
 * implied probability per side (current pool share). Presentational:
 * value/onChange are owned by the caller.
 */
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import type { Outcome } from '@/shared/schemas';

const SIDE_COLORS = [colors.jade, colors.coral, colors.gold, colors.royal, colors.muted];

interface Props {
  outcomes: Outcome[];
  value: string | null;
  onChange: (outcomeId: string) => void;
  /** Current pool per outcome — used to render implied % per side. */
  poolByOutcome?: Record<string, number>;
  className?: string;
}

export function OutcomePicker({ outcomes, value, onChange, poolByOutcome, className = '' }: Props) {
  const total = poolByOutcome
    ? Object.values(poolByOutcome).reduce((s, v) => s + v, 0)
    : 0;

  const handlePress = (id: string) => {
    if (id === value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(id);
  };

  return (
    <View className={`gap-2 ${className}`}>
      {outcomes.map((outcome, i) => {
        const accent = outcome.color ?? SIDE_COLORS[i % SIDE_COLORS.length];
        const selected = value === outcome.id;
        const sidePool = poolByOutcome?.[outcome.id] ?? 0;
        const implied = total > 0 ? Math.round((sidePool / total) * 100) : null;
        return (
          <OutcomeChip
            key={outcome.id}
            label={outcome.label}
            accent={accent}
            selected={selected}
            implied={implied}
            onPress={() => handlePress(outcome.id)}
          />
        );
      })}
    </View>
  );
}

function OutcomeChip({
  label,
  accent,
  selected,
  implied,
  onPress,
}: {
  label: string;
  accent: string;
  selected: boolean;
  implied: number | null;
  onPress: () => void;
}) {
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1.02 : 1, { damping: 18, stiffness: 220 }) }],
  }));

  return (
    <Animated.View style={aStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 12,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? accent : colors.hairline,
          backgroundColor: selected ? `${accent}1F` : colors.surface,
          paddingVertical: 14,
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: accent,
            backgroundColor: selected ? accent : 'transparent',
          }}
        />
        <Txt variant="heading" className="flex-1" style={selected ? { color: colors.text } : undefined}>
          {label}
        </Txt>
        {implied !== null ? (
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              backgroundColor: `${accent}26`,
            }}
          >
            <Txt variant="caption" style={{ color: accent, fontWeight: '700' }}>
              {implied}%
            </Txt>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
