/**
 * Renders toasts pushed via @/lib/toast. Mount once near the app root (above the
 * navigator). Works on iOS, Android, web. Pure JS + Reanimated — no native module.
 */
import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { subscribeToasts, type ToastEvent } from '@/lib/toast';

const ACCENT: Record<string, string> = {
  done: colors.jade,
  error: colors.coral,
  none: colors.muted,
};
const GLYPH: Record<string, string> = { done: '✓', error: '!', none: '•' };

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return subscribeToasts((t) => {
      setToasts((prev) => [...prev.slice(-2), t]);
      const ms = t.duration ?? 2600;
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), ms);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <SafeAreaView
      pointerEvents="box-none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 9999 }}
      edges={['top']}
    >
      <View style={{ width: '100%', paddingHorizontal: 16, paddingTop: 6, gap: 8 }} pointerEvents="box-none">
        {toasts.map((t) => {
          const accent = ACCENT[t.preset ?? 'none'];
          return (
            <Animated.View key={t.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp}>
              <Pressable
                onPress={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.hairline,
                  borderWidth: 1,
                  borderLeftColor: accent,
                  borderLeftWidth: 3,
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  shadowColor: '#000',
                  shadowOpacity: 0.4,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 8,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: `${accent}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt style={{ color: accent, fontWeight: '800', fontSize: 13 }}>
                    {GLYPH[t.preset ?? 'none']}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="label" style={{ color: colors.text }}>
                    {t.title}
                  </Txt>
                  {t.message ? (
                    <Txt variant="caption" dim numberOfLines={2}>
                      {t.message}
                    </Txt>
                  ) : null}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
