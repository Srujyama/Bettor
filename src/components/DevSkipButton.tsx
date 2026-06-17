/**
 * DEV-ONLY floating "skip" button, mounted at the app root so it's reachable on
 * EVERY screen (welcome → auth → onboarding → the app). Lets you jump straight
 * into the tabs when the backend/setup isn't cooperating, for UI testing.
 *
 * Stripped from production builds via __DEV__ (renders null). It also hides once
 * you're already in the main app (status authenticated + onboarded or bypassed).
 *
 * TODO(chipd): remove this and the devBypass flag before any real release.
 */
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useOnboarding } from '@/stores/ui';
import { useSession, isOnboarded } from '@/stores/session';

export function DevSkipButton() {
  const insets = useSafeAreaInsets();
  const profile = useSession((s) => s.profile);
  const devBypass = useOnboarding((s) => s.devBypass);
  const setAgeAcknowledged = useOnboarding((s) => s.setAgeAcknowledged);
  const setTutorialDone = useOnboarding((s) => s.setTutorialDone);
  const setDevBypass = useOnboarding((s) => s.setDevBypass);

  if (!__DEV__) return null;
  // Show only while the user is still in the front-door / onboarding flow — i.e.
  // not yet a fully onboarded (or already-bypassed) account. Gating on state, not
  // pathname, is unambiguous (welcome and the feed both resolve to "/"), and the
  // button never covers the in-app tab bar.
  const inApp = isOnboarded(profile) || devBypass;
  if (inApp) return null;

  const skip = () => {
    setAgeAcknowledged(true);
    setTutorialDone(true);
    setDevBypass(true);
    router.replace('/(tabs)');
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', right: 12, bottom: insets.bottom + 12, zIndex: 99999 }}
    >
      <Pressable
        onPress={skip}
        hitSlop={10}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: 'rgba(245,196,81,0.18)',
          borderColor: colors.gold,
          borderWidth: 1,
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 14,
        }}
      >
        <Txt style={{ fontSize: 12 }}>🛠️</Txt>
        <Txt variant="caption" style={{ color: colors.gold, fontWeight: '700' }}>
          DEV: skip →
        </Txt>
      </Pressable>
    </View>
  );
}
