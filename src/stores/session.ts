/**
 * Session store — auth status, current uid, App Check readiness gate, and the
 * cached current-user profile. Small, synchronous, device-local. NEVER holds
 * money (that lives in Firestore behind React Query).
 */
import { create } from 'zustand';
import type { User } from '@/shared/schemas';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface SessionState {
  status: AuthStatus;
  uid: string | null;
  /** Gate Cloud Function calls until App Check has a token (no-op in dev). */
  appCheckReady: boolean;
  /** Cached current-user profile doc (kept in sync by useCurrentUser). */
  profile: User | null;
  setStatus: (status: AuthStatus, uid?: string | null) => void;
  setAppCheckReady: (ready: boolean) => void;
  setProfile: (profile: User | null) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  uid: null,
  appCheckReady: true, // dev default; flips false when App Check is enforced
  profile: null,
  setStatus: (status, uid) => set({ status, uid: uid ?? null }),
  setAppCheckReady: (appCheckReady) => set({ appCheckReady }),
  setProfile: (profile) => set({ profile }),
  reset: () => set({ status: 'unauthenticated', uid: null, profile: null }),
}));

/** Derived: has the user completed onboarding (verified age + claimed handle)? */
export function isOnboarded(profile: User | null): boolean {
  return Boolean(profile?.ageVerified && profile?.handle);
}
