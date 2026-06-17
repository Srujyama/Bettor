/**
 * DEV-ONLY floating "skip" button, mounted at the app root so it's reachable on
 * EVERY front-door screen (welcome → auth → onboarding). Lets you jump straight
 * into the app when the backend/setup isn't cooperating, for UI testing.
 *
 * Stripped from production builds via __DEV__ (renders null). It hides once the
 * user is actually in the app (authenticated + onboarded or bypassed) so it
 * never covers the tab bar.
 *
 * TODO(chipd): remove this and the devBypass flag before any real release.
 */
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '@/lib/toast';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useOnboarding } from '@/stores/ui';
import { useSession, isOnboarded } from '@/stores/session';
import { authService } from '@/lib/firebase';

export function DevSkipButton() {
  const insets = useSafeAreaInsets();
  const status = useSession((s) => s.status);
  const profile = useSession((s) => s.profile);
  const devBypass = useOnboarding((s) => s.devBypass);
  const setAgeAcknowledged = useOnboarding((s) => s.setAgeAcknowledged);
  const setTutorialDone = useOnboarding((s) => s.setTutorialDone);
  const setDevBypass = useOnboarding((s) => s.setDevBypass);

  if (!__DEV__) return null;
  // Show whenever we are NOT actually inside the app — i.e. the front-door/auth
  // screens (status !== authenticated) OR signed-in-but-not-onboarded. Once the
  // user is authenticated AND onboarded (or has used the bypass), they're in the
  // tabs, so hide. Gating on state (not pathname) is unambiguous: welcome and
  // the feed both resolve to "/".
  const inApp = status === 'authenticated' && (isOnboarded(profile) || devBypass);
  if (inApp) return null;

  // From the front door we still need a Firebase user for the app to function
  // (wallet/bets are per-uid), so the skip signs into (or creates) a fixed dev
  // account, then bypasses onboarding. We do NOT router.replace here when signing
  // in — the AuthGate routes to the tabs once `status` flips to authenticated and
  // devBypass is set (avoids racing the guard's unauthenticated redirect).
  const skip = async () => {
    setAgeAcknowledged(true);
    setTutorialDone(true);
    setDevBypass(true);
    if (status === 'authenticated') {
      router.replace('/(tabs)');
      return;
    }
    const email = 'devskip@chipd.dev';
    const pass = 'devskip123';
    try {
      await authService.signUpEmail(email, pass, 'Dev Tester');
    } catch {
      try {
        await authService.signInEmail(email, pass);
      } catch (e: unknown) {
        toast({
          title: 'Dev skip failed to sign in',
          message: e instanceof Error ? e.message : 'unknown error',
          preset: 'error',
        });
      }
    }
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
