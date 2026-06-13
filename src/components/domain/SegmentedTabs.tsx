/**
 * SegmentedTabs — a reusable pill tab switcher. The selected segment slides via
 * a spring; reduce-motion degrades to an instant move (the spring is subtle
 * either way). Presentational: value/onChange are owned by the caller.
 */
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  tabs: string[];
  value: string;
  onChange: (tab: string) => void;
  className?: string;
}

export function SegmentedTabs({ tabs, value, onChange, className = '' }: Props) {
  const [width, setWidth] = useState(0);
  const count = Math.max(1, tabs.length);
  const segW = width / count;
  const activeIndex = Math.max(0, tabs.indexOf(value));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const indicator = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: withSpring(activeIndex * segW, { damping: 20, stiffness: 200 }) }],
  }));

  const handlePress = (tab: string) => {
    if (tab === value) return;
    Haptics.selectionAsync();
    onChange(tab);
  };

  return (
    <View
      onLayout={onLayout}
      className={`relative h-11 flex-row rounded-pill border border-hairline bg-surface-sunken p-1 ${className}`}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: 4,
              borderRadius: 999,
              backgroundColor: colors.surfaceRaised,
              borderWidth: 1,
              borderColor: colors.hairline,
            },
            indicator,
            { width: segW - 8 },
          ]}
        />
      ) : null}
      {tabs.map((tab) => {
        const active = tab === value;
        return (
          <Pressable
            key={tab}
            onPress={() => handlePress(tab)}
            className="flex-1 items-center justify-center"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Txt variant="label" className={active ? 'text-text' : 'text-text-dim'}>
              {tab}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
