/**
 * Safe font loading for the pilot.
 *
 * The brand calls for a display family (Clash Display) and a mono family (Geist
 * Mono), but we ship the pilot on the system stack so the app can never crash on
 * a missing font asset. The tailwind `font-display`/`font-mono` families list a
 * system fallback (`System`, `Courier`) so type still renders cleanly.
 *
 * If/when the real .otf/.ttf files land in assets/fonts, register them in
 * FONT_MAP below (e.g. `ClashDisplay: require('../../assets/fonts/ClashDisplay.otf')`)
 * — useLoadFonts() will pick them up with no other change. With an empty map
 * expo-font resolves immediately, so `ready` is always true for the pilot.
 */
import { useEffect, useState } from 'react';
import * as Font from 'expo-font';

/**
 * Font family name → asset module. EMPTY on purpose for the pilot so we never
 * `require()` a font file that isn't present in the bundle. Add entries here to
 * upgrade to custom families without touching any screen.
 */
export const FONT_MAP: Record<string, number> = {};

/**
 * Loads any registered custom fonts (none for the pilot) and reports readiness.
 * Always resolves to `ready: true` — an empty map means expo-font has nothing to
 * fetch, and any unexpected error degrades gracefully to system fonts rather
 * than blocking the splash screen forever.
 */
export function useLoadFonts(): { ready: boolean; error: Error | null } {
  const [ready, setReady] = useState(Object.keys(FONT_MAP).length === 0);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (Object.keys(FONT_MAP).length === 0) {
      setReady(true);
      return;
    }
    let cancelled = false;
    Font.loadAsync(FONT_MAP)
      .catch((e: unknown) => {
        // Missing/invalid font assets must never wedge the app — fall back to system.
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready, error };
}
