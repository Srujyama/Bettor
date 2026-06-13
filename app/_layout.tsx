/**
 * Root layout — the single mount point for every cross-cutting provider plus the
 * auth/onboarding routing brain.
 *
 * Provider order (outermost → innermost):
 *   GestureHandlerRootView → SafeAreaProvider → PersistQueryClientProvider
 *   → BottomSheetModalProvider → AuthGate (Stack + Redirect logic).
 *
 * AuthGate subscribes to authService.onAuth, mirrors the Firebase user into the
 * session store, and keeps a live subscription to the user's profile doc so the
 * onboarding gate reacts the moment verifyAge/profile writes land. <WinCelebration>
 * is mounted globally so a payout can celebrate from anywhere in the app.
 */
import 'react-native-gesture-handler';
import '../global.css';

import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, Stack, SplashScreen } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';

import { queryClient, persistOptions } from '@/lib/queryClient';
import { useLoadFonts } from '@/lib/fonts';
import { authService, subscribeDoc, paths } from '@/lib/firebase';
import { useSession, isOnboarded } from '@/stores/session';
import { useOnboarding } from '@/stores/ui';
import { WinCelebration } from '@/components/domain';
import { ChipCounter, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { ECONOMY } from '@/shared/constants';
import type { User } from '@/shared/schemas';

// Keep the native splash up until fonts + the first auth resolution are ready.
SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: splash may already be hidden during Fast Refresh */
});

export default function RootLayout() {
  const { ready: fontsReady } = useLoadFonts();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.ink }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <AuthGate fontsReady={fontsReady} />
            <WinCelebration />
          </BottomSheetModalProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AuthGate({ fontsReady }: { fontsReady: boolean }) {
  const status = useSession((s) => s.status);
  const uid = useSession((s) => s.uid);
  const profile = useSession((s) => s.profile);
  const setStatus = useSession((s) => s.setStatus);
  const setProfile = useSession((s) => s.setProfile);

  // 1) Mirror Firebase auth state into the session store.
  useEffect(() => {
    const unsub = authService.onAuth((user) => {
      if (user) {
        setStatus('authenticated', user.uid);
      } else {
        setStatus('unauthenticated', null);
        setProfile(null);
      }
    });
    return unsub;
  }, [setStatus, setProfile]);

  // 2) Keep a live subscription to the signed-in user's profile doc. The doc may
  //    not exist yet immediately after sign-up (verifyAge creates it) — that's a
  //    valid "authenticated but not onboarded" state and routes to (onboarding).
  useEffect(() => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const unsub = subscribeDoc<User>(
      paths.user(uid),
      (doc) => setProfile(doc),
      () => setProfile(null),
    );
    return unsub;
  }, [uid, setProfile]);

  // 3) Hide the splash once fonts + the first auth resolution are in.
  const booted = fontsReady && status !== 'loading';
  useEffect(() => {
    if (booted) SplashScreen.hideAsync().catch(() => undefined);
  }, [booted]);

  // The Stack must always render so expo-router has a navigator; the Redirect
  // children below steer the user to the correct group.
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ink },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="bet" />
        <Stack.Screen name="group" />
        <Stack.Screen name="user" />
        <Stack.Screen name="leaderboard" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="shop" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>

      <RouteGuard booted={booted} status={status} profile={profile} />
    </View>
  );
}

/**
 * Declarative router. While booting it shows the branded splash overlay; once
 * booted it emits a single <Redirect> to the correct group based on auth +
 * onboarding state. Rendering Redirect inside the tree (rather than imperative
 * navigation in an effect) avoids the "navigate before mount" race entirely.
 *
 * Subtlety: the server bootstraps a starter handle on sign-up, so the moment
 * verifyAge flips ageVerified the profile is technically "onboarded". We do NOT
 * force the user to the tabs at that instant — the rest of the onboarding flow
 * (profile, RG consent, starter-Chips reveal, find-friends) lives behind the
 * persisted `tutorialDone` flag. So:
 *   • not onboarded (age unverified)            → push into the age gate
 *   • onboarded, mid-flow on THIS device        → leave them in (onboarding)
 *   • onboarded returning user / flow finished  → into the app (tabs)
 *
 * "mid-flow on this device" = the local age acknowledgement is set (the age gate
 * just ran here) but the tutorial isn't marked done yet. A returning user on a
 * fresh install has neither local flag set, so they go straight to the tabs.
 */
function RouteGuard({
  booted,
  status,
  profile,
}: {
  booted: boolean;
  status: ReturnType<typeof useSession.getState>['status'];
  profile: User | null;
}) {
  const tutorialDone = useOnboarding((s) => s.tutorialDone);
  const ageAcknowledged = useOnboarding((s) => s.ageAcknowledged);

  if (!booted || status === 'loading') return <SplashOverlay />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)" />;
  if (!isOnboarded(profile)) return <Redirect href="/(onboarding)/age-gate" />;
  // Onboarded. If this device is mid-flow, don't yank the user to the tabs —
  // let the onboarding screens finish driving navigation themselves.
  if (ageAcknowledged && !tutorialDone) return null;
  return <Redirect href="/(tabs)" />;
}

/** Branded boot screen shown over the navigator while we resolve fonts/auth. */
function SplashOverlay() {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.ink,
        gap: 12,
      }}
    >
      <Txt variant="display" style={{ color: colors.text }}>
        Chipd
      </Txt>
      <ChipCounter value={ECONOMY.SIGNUP_GRANT} size={20} color={colors.textFaint} />
    </View>
  );
}
