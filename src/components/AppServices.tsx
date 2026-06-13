/**
 * AppServices — mounts the app-wide runtime side-effects ONCE for a signed-in,
 * onboarded user. Rendering null; it's pure effects. Kept out of the root layout
 * so _layout.tsx stays focused on providers + routing.
 *
 * Responsibilities:
 *  - Register for push + handle notification taps (deep-link into the target).
 *  - Seed the current period's missions on app open (ensureMissions).
 *  - Fire the responsible-gaming reality check on a session tick.
 */
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { useRealityCheck } from '@/features/social/hooks';
import { registerForPush, onNotificationTap } from '@/lib/notifications';
import { fns } from '@/lib/firebase';

export function AppServices() {
  const status = useSession((s) => s.status);
  const uid = useSession((s) => s.uid);
  const profile = useSession((s) => s.profile);
  const ready = status === 'authenticated' && !!uid && !!profile?.ageVerified;

  return ready ? <ActiveServices key={uid} /> : null;
}

function ActiveServices() {
  // ── Push registration + deep-link tap routing ──
  useEffect(() => {
    let mounted = true;
    registerForPush().catch(() => undefined);
    const unsub = onNotificationTap((data) => {
      if (!mounted) return;
      const link = (data?.deepLink as string) || (data?.betId ? `/bet/${data.betId}` : null);
      if (link) {
        try {
          router.push(link as never);
        } catch {
          /* unknown route — ignore */
        }
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // ── Seed the current period's missions on open (idempotent server-side) ──
  useEffect(() => {
    fns.ensureMissions().catch(() => undefined);
  }, []);

  // ── Responsible-gaming reality check on a session tick ──
  useRealityCheckTrigger();

  return null;
}

/**
 * Polls the reality-check condition once a minute. When it trips, route to the
 * reality-check modal (which records the check via useUi().noteRealityCheck).
 * Guarded so we only push once per trip and never stack modals.
 */
function useRealityCheckTrigger() {
  const [now, setNow] = useState(() => Date.now());
  const shownRef = useRef(false);
  const noteRealityCheck = useUi((s) => s.noteRealityCheck);
  const lastRealityCheckAt = useUi((s) => s.lastRealityCheckAt);
  const { shouldShow } = useRealityCheck(now);

  // Reset the once-per-trip guard whenever a check is recorded.
  useEffect(() => {
    shownRef.current = false;
  }, [lastRealityCheckAt]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (shouldShow && !shownRef.current) {
      shownRef.current = true;
      try {
        router.push('/(modals)/reality-check');
      } catch {
        // Modal route not available — at minimum note the check so we don't loop.
        noteRealityCheck();
      }
    }
  }, [shouldShow, noteRealityCheck]);

  return null;
}
