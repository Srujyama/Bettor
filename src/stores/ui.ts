/**
 * Ephemeral UI state: confetti triggers, staking slider value, last reality
 * check time, onboarding progress. Persisted bits (onboarding ack, RG consent)
 * go through AsyncStorage so they survive restarts.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UiState {
  // Win celebration
  celebrate: { betId: string; amount: number } | null;
  triggerCelebrate: (betId: string, amount: number) => void;
  clearCelebrate: () => void;

  // Staking sheet
  stakeDraft: number;
  setStakeDraft: (n: number) => void;

  // Reality-check bookkeeping (responsible gaming)
  sessionStartedAt: number;
  lastRealityCheckAt: number;
  noteRealityCheck: () => void;
  resetSession: () => void;
}

export const useUi = create<UiState>((set) => ({
  celebrate: null,
  triggerCelebrate: (betId, amount) => set({ celebrate: { betId, amount } }),
  clearCelebrate: () => set({ celebrate: null }),

  stakeDraft: 100,
  setStakeDraft: (stakeDraft) => set({ stakeDraft }),

  sessionStartedAt: Date.now(),
  lastRealityCheckAt: Date.now(),
  noteRealityCheck: () => set({ lastRealityCheckAt: Date.now() }),
  resetSession: () => set({ sessionStartedAt: Date.now(), lastRealityCheckAt: Date.now() }),
}));

interface OnboardingState {
  ageAcknowledged: boolean;
  rgConsented: boolean;
  tutorialDone: boolean;
  /**
   * DEV-ONLY escape hatch. When true (and only in __DEV__), the root RouteGuard
   * treats the user as onboarded so you can reach the app even if the backend
   * (e.g. verifyAge) isn't reachable. NEVER honored in production builds.
   * TODO(chipd): remove once age verification is reliable end-to-end and a real
   * staging backend is wired — this exists only to unblock UI testing.
   */
  devBypass: boolean;
  setAgeAcknowledged: (v: boolean) => void;
  setRgConsented: (v: boolean) => void;
  setTutorialDone: (v: boolean) => void;
  setDevBypass: (v: boolean) => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      ageAcknowledged: false,
      rgConsented: false,
      tutorialDone: false,
      devBypass: false,
      setAgeAcknowledged: (ageAcknowledged) => set({ ageAcknowledged }),
      setRgConsented: (rgConsented) => set({ rgConsented }),
      setTutorialDone: (tutorialDone) => set({ tutorialDone }),
      setDevBypass: (devBypass) => set({ devBypass }),
    }),
    { name: 'chipd-onboarding', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
