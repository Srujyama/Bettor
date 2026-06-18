import { ActivityIndicator, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Txt } from './Text';
import { colors } from '@/theme';

type Tone = 'jade' | 'coral' | 'gold' | 'royal' | 'ghost' | 'danger';

// Matte: solid fills, not glossy gradients. A flat, confident block of color
// reads bolder than a sheen. Filled tones use dark ink text for crisp contrast.
const TONE_FILL: Record<string, string> = {
  jade: colors.jade,
  coral: colors.coral,
  gold: colors.gold,
  royal: colors.royal,
};

interface Props {
  label: string;
  onPress?: () => void;
  tone?: Tone;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  haptic?: boolean;
  icon?: React.ReactNode;
  className?: string;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  tone = 'jade',
  disabled,
  loading,
  size = 'md',
  haptic = true,
  icon,
  className = '',
  fullWidth = true,
}: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const padding = size === 'lg' ? 'py-4 px-6' : size === 'sm' ? 'py-2 px-3' : 'py-3.5 px-5';
  const textVariant = size === 'sm' ? 'label' : 'heading';
  const isFilled = tone !== 'ghost' && tone !== 'danger';
  const off = disabled || loading;

  const handlePress = () => {
    if (off) return;
    if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress?.();
  };

  const content = (
    <View className="flex-row items-center justify-center gap-2">
      {loading ? (
        <ActivityIndicator color={tone === 'ghost' ? colors.text : colors.ink} />
      ) : (
        <>
          {icon}
          <Txt
            variant={textVariant}
            className={
              isFilled
                ? 'text-ink'
                : tone === 'danger'
                  ? 'text-coral'
                  : 'text-text'
            }
          >
            {label}
          </Txt>
        </>
      )}
    </View>
  );

  return (
    <Animated.View style={[aStyle, fullWidth && { width: '100%' }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => (scale.value = withSpring(0.96, { damping: 15 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 15 }))}
        disabled={off}
        style={{ opacity: off ? 0.5 : 1 }}
        className={className}
      >
        {isFilled ? (
          <View
            className={`rounded-chip ${padding}`}
            style={{ backgroundColor: TONE_FILL[tone] }}
          >
            {content}
          </View>
        ) : (
          <View
            className={`rounded-chip ${padding} ${
              tone === 'danger' ? 'border border-coral/40 bg-coral/10' : 'border border-hairline bg-surface-raised'
            }`}
          >
            {content}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
