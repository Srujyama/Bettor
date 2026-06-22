/**
 * Location service — wraps expo-location for the "in your area" bets feature.
 * Handles permission, a coarse one-shot position, a reverse-geocoded neighborhood
 * label, and a manual fallback when permission is denied. All consumers go
 * through here so the rest of the app stays platform-agnostic.
 *
 * PRIVACY: we only ever request COARSE/balanced accuracy, never track in the
 * background, and the precise coordinate is fuzzed (see @/shared/geo) before it
 * is sent to the server or shown to anyone.
 */
import * as Location from 'expo-location';
import type { LatLng } from '@/shared/geo';

export type LocationPermission = 'granted' | 'denied' | 'undetermined';

export interface CoarsePosition extends LatLng {
  /** A coarse, human label like "Taipa, Macau" (best-effort; may be null). */
  placeName: string | null;
}

/** Current permission status without prompting. */
export async function getLocationPermission(): Promise<LocationPermission> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status as LocationPermission;
  } catch {
    return 'undetermined';
  }
}

/** Prompt for foreground location permission. Returns the resulting status. */
export async function requestLocationPermission(): Promise<LocationPermission> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status as LocationPermission;
  } catch {
    return 'denied';
  }
}

/**
 * One-shot coarse position + a best-effort neighborhood label. Returns null if
 * permission isn't granted or the fix fails (caller should fall back to manual).
 */
export async function getCoarsePosition(): Promise<CoarsePosition | null> {
  try {
    const perm = await getLocationPermission();
    if (perm !== 'granted') return null;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }).catch(() => null);
    const fix =
      pos ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(
        () => null,
      ));
    if (!fix) return null;
    const lat = fix.coords.latitude;
    const lng = fix.coords.longitude;
    const placeName = await reverseGeocode({ lat, lng });
    return { lat, lng, placeName };
  } catch {
    return null;
  }
}

/** Best-effort coarse place label for a coordinate. Returns null on failure. */
export async function reverseGeocode(point: LatLng): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: point.lat,
      longitude: point.lng,
    });
    const r = results[0];
    if (!r) return null;
    // Prefer a neighborhood/district-level label over a precise street address.
    const area = r.district ?? r.subregion ?? r.city ?? r.region ?? null;
    const region = r.city && area !== r.city ? r.city : r.region ?? null;
    if (area && region && area !== region) return `${area}, ${region}`;
    return area ?? region ?? null;
  } catch {
    return null;
  }
}
