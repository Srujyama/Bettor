/**
 * Location feature hooks — bridge the expo-location service to the location store
 * and expose a friendly API for screens (request + fetch, manual set, refresh).
 */
import { useCallback, useState } from 'react';
import {
  getCoarsePosition,
  getLocationPermission,
  requestLocationPermission,
  reverseGeocode,
  type LocationPermission,
} from '@/lib/location';
import { useLocation } from '@/stores/location';
import type { LatLng } from '@/shared/geo';

export function useNearbyLocation() {
  const position = useLocation((s) => s.position);
  const placeName = useLocation((s) => s.placeName);
  const source = useLocation((s) => s.source);
  const radiusMeters = useLocation((s) => s.radiusMeters);
  const setPosition = useLocation((s) => s.setPosition);
  const setRadius = useLocation((s) => s.setRadius);
  const setPromptResolved = useLocation((s) => s.setPromptResolved);

  const [permission, setPermissionState] = useState<LocationPermission>('undetermined');
  const [loading, setLoading] = useState(false);

  /** Ask permission (if needed) and fetch a coarse fix into the store. */
  const enableGps = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      let perm = await getLocationPermission();
      if (perm === 'undetermined') perm = await requestLocationPermission();
      setPermissionState(perm);
      setPromptResolved(true);
      if (perm !== 'granted') return false;
      const pos = await getCoarsePosition();
      if (!pos) return false;
      setPosition({ lat: pos.lat, lng: pos.lng }, pos.placeName, 'gps');
      return true;
    } finally {
      setLoading(false);
    }
  }, [setPosition, setPromptResolved]);

  /** Set the location manually (e.g. dropped pin or picked city). */
  const setManual = useCallback(
    async (point: LatLng, label?: string | null) => {
      const name = label ?? (await reverseGeocode(point));
      setPosition(point, name ?? null, 'manual');
      setPromptResolved(true);
    },
    [setPosition, setPromptResolved],
  );

  /** Refresh the GPS fix if we're already using GPS. */
  const refresh = useCallback(async () => {
    if (source !== 'gps') return;
    const pos = await getCoarsePosition();
    if (pos) setPosition({ lat: pos.lat, lng: pos.lng }, pos.placeName, 'gps');
  }, [source, setPosition]);

  return {
    position,
    placeName,
    source,
    radiusMeters,
    permission,
    loading,
    hasLocation: !!position,
    enableGps,
    setManual,
    setRadius,
    refresh,
  };
}
