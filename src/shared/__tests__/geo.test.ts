import {
  DEFAULT_RADIUS_M,
  encodeGeohash,
  formatDistance,
  fuzzLocation,
  geohashQueryBounds,
  geohashUpperBound,
  haversineMeters,
  isValidLatLng,
  isWithinRadius,
  precisionForRadius,
  type LatLng,
} from '../geo';

const MACAU: LatLng = { lat: 22.1987, lng: 113.5439 };
const TAIPA: LatLng = { lat: 22.1554, lng: 113.5616 }; // ~5 km south of Macau peninsula
const HONGKONG: LatLng = { lat: 22.3193, lng: 114.1694 }; // ~65 km away

describe('haversine distance', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters(MACAU, MACAU)).toBeLessThan(1);
  });
  it('is symmetric', () => {
    expect(haversineMeters(MACAU, TAIPA)).toBeCloseTo(haversineMeters(TAIPA, MACAU), 5);
  });
  it('matches known approximate distances', () => {
    const taipa = haversineMeters(MACAU, TAIPA);
    expect(taipa).toBeGreaterThan(3_000);
    expect(taipa).toBeLessThan(7_000);
    const hk = haversineMeters(MACAU, HONGKONG);
    expect(hk).toBeGreaterThan(55_000);
    expect(hk).toBeLessThan(75_000);
  });
});

describe('formatDistance', () => {
  it('shows meters under ~1km and km above', () => {
    expect(formatDistance(120)).toMatch(/m away/);
    expect(formatDistance(2_400)).toBe('2.4 km away');
    expect(formatDistance(25_000)).toBe('25 km away');
  });
  it('returns empty for invalid input', () => {
    expect(formatDistance(-5)).toBe('');
    expect(formatDistance(NaN)).toBe('');
  });
});

describe('geohash', () => {
  it('encodes deterministically and shares a prefix for nearby points', () => {
    const a = encodeGeohash(MACAU, 7);
    expect(a).toBe(encodeGeohash(MACAU, 7));
    expect(a).toHaveLength(7);
    // A point ~150m away should share most of the prefix.
    const near = encodeGeohash({ lat: MACAU.lat + 0.001, lng: MACAU.lng }, 7);
    expect(near.slice(0, 4)).toBe(a.slice(0, 4));
  });
  it('gives a longer common prefix the closer two points are', () => {
    const base = encodeGeohash(MACAU, 9);
    const taipa = encodeGeohash(TAIPA, 9);
    const hk = encodeGeohash(HONGKONG, 9);
    const common = (x: string) => {
      let i = 0;
      while (i < x.length && x[i] === base[i]) i++;
      return i;
    };
    expect(common(taipa)).toBeGreaterThanOrEqual(common(hk));
  });
  it('precisionForRadius shrinks precision as radius grows', () => {
    expect(precisionForRadius(1_000)).toBeGreaterThanOrEqual(precisionForRadius(25_000));
  });
  it('query bounds include the center cell', () => {
    const bounds = geohashQueryBounds(MACAU, DEFAULT_RADIUS_M);
    const p = precisionForRadius(DEFAULT_RADIUS_M);
    expect(bounds).toContain(encodeGeohash(MACAU, p));
    expect(bounds.length).toBeGreaterThan(0);
    expect(bounds.length).toBeLessThanOrEqual(9);
  });
  it('upper bound sorts immediately after the prefix', () => {
    expect(geohashUpperBound('wecn') > 'wecn').toBe(true);
    // Incrementing the last char: 'b' → 'c'.
    expect(geohashUpperBound('web')).toBe('wec');
    // When the last char is the max ('z'), append a sentinel that sorts after it.
    expect(geohashUpperBound('9z')).toBe('9z~');
    expect(geohashUpperBound('9z') > '9z').toBe(true);
  });
});

describe('fuzzing (privacy)', () => {
  it('is deterministic — same input snaps to the same cell', () => {
    expect(fuzzLocation(MACAU)).toEqual(fuzzLocation(MACAU));
  });
  it('moves the point by less than the grid + keeps it nearby', () => {
    const f = fuzzLocation(MACAU, 600);
    expect(haversineMeters(MACAU, f)).toBeLessThan(900);
  });
  it('two close raw points can fuzz to the same neighborhood cell', () => {
    const a = fuzzLocation(MACAU, 600);
    const b = fuzzLocation({ lat: MACAU.lat + 0.0005, lng: MACAU.lng + 0.0005 }, 600);
    // within one grid step of each other
    expect(haversineMeters(a, b)).toBeLessThanOrEqual(900);
  });
});

describe('radius + validation', () => {
  it('isWithinRadius respects the boundary', () => {
    expect(isWithinRadius(MACAU, TAIPA, 7_000)).toBe(true);
    expect(isWithinRadius(MACAU, HONGKONG, 7_000)).toBe(false);
  });
  it('isValidLatLng rejects out-of-range + nullish', () => {
    expect(isValidLatLng(MACAU)).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng({ lat: 0 })).toBe(false);
  });
});
