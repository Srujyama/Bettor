/**
 * Location store — the user's current/chosen position and Nearby radius. Small,
 * device-local, persisted so the Nearby feed and create-bet wizard agree. The
 * raw coordinate stays on-device; only a fuzzed copy is ever sent to the server.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_RADIUS_M, type LatLng } from '@/shared/geo';

interface LocationState {
  /** Last known coarse position (raw, on-device only). null = unknown. */
  position: LatLng | null;
  /** Coarse neighborhood label for the position. */
  placeName: string | null;
  /** Whether the position came from GPS or a manual pick. */
  source: 'gps' | 'manual' | null;
  /** Chosen Nearby radius in meters. */
  radiusMeters: number;
  /** Whether the user has dismissed/answered the location prompt this session. */
  promptResolved: boolean;
  setPosition: (position: LatLng | null, placeName: string | null, source: 'gps' | 'manual') => void;
  setRadius: (radiusMeters: number) => void;
  setPromptResolved: (v: boolean) => void;
  clear: () => void;
}

export const useLocation = create<LocationState>()(
  persist(
    (set) => ({
      position: null,
      placeName: null,
      source: null,
      radiusMeters: DEFAULT_RADIUS_M,
      promptResolved: false,
      setPosition: (position, placeName, source) => set({ position, placeName, source }),
      setRadius: (radiusMeters) => set({ radiusMeters }),
      setPromptResolved: (promptResolved) => set({ promptResolved }),
      clear: () => set({ position: null, placeName: null, source: null }),
    }),
    {
      name: 'chipd-location',
      storage: createJSONStorage(() => AsyncStorage),
      // Don't persist promptResolved — re-evaluate each session.
      partialize: (s) => ({
        position: s.position,
        placeName: s.placeName,
        source: s.source,
        radiusMeters: s.radiusMeters,
      }),
    },
  ),
);
