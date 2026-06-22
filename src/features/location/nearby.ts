/**
 * useNearbyBets — the "in your area" read. Local bets are stored with a geohash
 * of their fuzzed coordinate; to find bets within a radius we run a handful of
 * geohash *prefix range* queries (one per covering cell), merge + dedupe the
 * results, then filter by exact haversine distance and sort nearest-first.
 *
 * This can't use the single-query onSnapshot helper in data.ts, so it lives here
 * and uses React Query with a short refetch interval for freshness.
 */
import { useQuery } from '@tanstack/react-query';
import {
  collection,
  endBefore,
  getDocs,
  orderBy,
  query,
  startAt,
  where,
  limit as fbLimit,
} from 'firebase/firestore';
import { db, normalize } from '@/lib/firebase/firestore';
import { paths } from '@/lib/firebase/paths';
import {
  geohashQueryBounds,
  geohashUpperBound,
  haversineMeters,
  type LatLng,
} from '@/shared/geo';
import { BET_STATUS, BET_VISIBILITY } from '@/shared/constants';
import type { Bet } from '@/shared/schemas';

export interface NearbyBet extends Bet {
  /** Exact distance (m) from the viewer to the bet's fuzzed location. */
  distanceMeters: number;
}

async function fetchNearby(center: LatLng, radiusMeters: number, max: number): Promise<NearbyBet[]> {
  const prefixes = geohashQueryBounds(center, radiusMeters);
  const col = collection(db, paths.bets());

  // One prefix-range query per covering geohash cell.
  const snaps = await Promise.all(
    prefixes.map((p) =>
      getDocs(
        query(
          col,
          where('visibility', '==', BET_VISIBILITY.LOCAL),
          orderBy('geohash'),
          startAt(p),
          endBefore(geohashUpperBound(p)),
          fbLimit(40),
        ),
      ).catch(() => null),
    ),
  );

  const seen = new Set<string>();
  const out: NearbyBet[] = [];
  for (const snap of snaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const bet = { ...normalize<Bet>(d.data()), id: d.id } as Bet;
      // Only open bets with a usable location, inside the requested radius.
      if (bet.status !== BET_STATUS.OPEN) continue;
      if (bet.lat == null || bet.lng == null) continue;
      const distanceMeters = haversineMeters(center, { lat: bet.lat, lng: bet.lng });
      if (distanceMeters > radiusMeters) continue;
      out.push({ ...bet, distanceMeters });
    }
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out.slice(0, max);
}

export function useNearbyBets(
  center: LatLng | null,
  radiusMeters: number,
  max = 50,
) {
  return useQuery<NearbyBet[]>({
    queryKey: [
      'nearbyBets',
      center ? `${center.lat.toFixed(3)},${center.lng.toFixed(3)}` : null,
      radiusMeters,
      max,
    ],
    queryFn: () => (center ? fetchNearby(center, radiusMeters, max) : Promise.resolve([])),
    enabled: !!center,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
