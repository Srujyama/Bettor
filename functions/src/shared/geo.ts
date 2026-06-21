/**
 * Geo math for location-based ("in your area") bets. Pure, deterministic, no
 * deps. Shared by the client (distance display, radius selection) and Cloud
 * Functions (geohash stamping, fuzzing for privacy).
 *
 * We use GEOHASH to make radius queries cheap on Firestore: a geohash prefix
 * covers a rectangular cell, so "bets near me" becomes a small set of prefix
 * range queries over the bet's `geohash` field (no GeoPoint index needed). The
 * client then filters by exact haversine distance.
 *
 * PRIVACY: a posted bet's precise coordinates are fuzzed to a coarse grid before
 * storage/display, so others only ever see an approximate neighborhood — never a
 * user's exact position.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Human distance label, e.g. "120 m away", "2.4 km away", "далеко". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m away`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

// ─── Geohash (base-32, Niemeyer) ───────────────────────────────────────────────

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Encode a coordinate to a geohash of `precision` chars (default 7 ≈ 150m cell). */
export function encodeGeohash(point: LatLng, precision = 7): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (point.lng >= mid) {
        ch |= 1 << (4 - bit);
        lngMin = mid;
      } else lngMax = mid;
    } else {
      const mid = (latMin + latMax) / 2;
      if (point.lat >= mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else latMax = mid;
    }
    even = !even;
    if (bit < 4) bit++;
    else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Approx cell size (meters) for a geohash precision, used to pick query precision. */
const GEOHASH_CELL_M: Record<number, number> = {
  1: 5_000_000,
  2: 1_250_000,
  3: 156_000,
  4: 39_000,
  5: 4_900,
  6: 1_200,
  7: 152,
  8: 38,
};

/** The geohash precision whose cell is just larger than `radiusMeters`. */
export function precisionForRadius(radiusMeters: number): number {
  for (let p = 8; p >= 1; p--) {
    if ((GEOHASH_CELL_M[p] ?? 0) >= radiusMeters) return p;
  }
  return 1;
}

/**
 * Geohash prefixes covering a circle of `radiusMeters` around `center`. Querying
 * `geohash` with a `>= prefix && < prefix+1` range for each returns a superset of
 * nearby docs (then filter by exact distance on the client). Returns the center
 * cell plus its 8 neighbors at the chosen precision — enough to cover the radius
 * since we pick a precision whose cell ≥ radius.
 */
export function geohashQueryBounds(center: LatLng, radiusMeters: number): string[] {
  const precision = Math.max(1, precisionForRadius(radiusMeters));
  const set = new Set<string>();
  // Sample the center + 8 compass points at the radius to collect covering cells.
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.01, Math.cos(toRad(center.lat)));
  const offsets: LatLng[] = [
    { lat: 0, lng: 0 },
    { lat: dLat, lng: 0 },
    { lat: -dLat, lng: 0 },
    { lat: 0, lng: dLng },
    { lat: 0, lng: -dLng },
    { lat: dLat, lng: dLng },
    { lat: dLat, lng: -dLng },
    { lat: -dLat, lng: dLng },
    { lat: -dLat, lng: -dLng },
  ];
  for (const o of offsets) {
    set.add(encodeGeohash({ lat: center.lat + o.lat, lng: center.lng + o.lng }, precision));
  }
  return [...set];
}

/** The exclusive upper bound for a geohash prefix range query (prefix + last char + 1). */
export function geohashUpperBound(prefix: string): string {
  const last = prefix[prefix.length - 1];
  const idx = BASE32.indexOf(last);
  if (idx < 0 || idx === BASE32.length - 1) return prefix + '~'; // '~' sorts after base32
  return prefix.slice(0, -1) + BASE32[idx + 1];
}

// ─── Privacy fuzzing ───────────────────────────────────────────────────────────

/**
 * Snap a coordinate to a coarse grid (~600m by default) so a stored/displayed
 * location reveals only an approximate neighborhood, never an exact position.
 * Deterministic: the same input always fuzzes to the same cell center.
 */
export function fuzzLocation(point: LatLng, gridMeters = 600): LatLng {
  const latStep = (gridMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const lngStep = latStep / Math.max(0.01, Math.cos(toRad(point.lat)));
  const lat = Math.round(point.lat / latStep) * latStep;
  const lng = Math.round(point.lng / lngStep) * lngStep;
  return { lat: +lat.toFixed(5), lng: +lng.toFixed(5) };
}

/** Radius presets offered in the Nearby UI (meters). */
export const RADIUS_PRESETS = [
  { label: '1 km', meters: 1_000 },
  { label: '5 km', meters: 5_000 },
  { label: '25 km', meters: 25_000 },
  { label: '100 km', meters: 100_000 },
] as const;

export const DEFAULT_RADIUS_M = 5_000;

/** True if a point is within radius of center (exact haversine check). */
export function isWithinRadius(center: LatLng, point: LatLng, radiusMeters: number): boolean {
  return haversineMeters(center, point) <= radiusMeters;
}

/** Validate a lat/lng is in range. */
export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}
