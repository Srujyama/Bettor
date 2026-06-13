/**
 * Sports data provider PORT (hexagonal seam).
 *
 * The rest of the backend depends ONLY on the `SportsProvider` interface, never
 * on a concrete vendor. The pilot ships `MockSportsProvider`, which generates
 * believable fixtures (NBA / EPL / UFC etc.) DETERMINISTICALLY from the wall
 * clock — no external API key, no network, fully reproducible in tests and the
 * emulator. A real adapter (e.g. API-Sports / TheSportsDB) drops in later by
 * implementing the same interface; nothing else changes.
 *
 * Seam contract:
 *   • `listUpcoming(opts)` — fixtures starting in the near future (scheduled).
 *   • `listLive(opts)`     — fixtures currently in progress (with live score/clock).
 *   • `getResult(id)`      — the authoritative final score for one fixture, or
 *                            null when it is not yet final / unknown.
 *
 * All returned objects conform to the shared `Fixture` zod type (schemas-ext),
 * so syncFixtures/updateLiveScores can write them straight to fixtures/{id}.
 *
 * To swap in a real provider:
 *   1. Implement `SportsProvider` in e.g. `sports/apiSportsProvider.ts`, mapping
 *      the vendor payload → `Fixture` (keep `fixtureId` stable & vendor-prefixed).
 *   2. Change `getSportsProvider()` below to return it behind an env flag
 *      (e.g. `process.env.SPORTS_PROVIDER === 'api-sports'`), leaving the mock as
 *      the default so dev/emulator keeps working offline.
 */
import type { Fixture } from '../shared/schemas-ext';

/** Filters a caller can apply when listing fixtures. */
export interface ListFixturesOptions {
  /** Restrict to one sport id (e.g. 'basketball'). */
  sport?: string;
  /** Restrict to one league code (e.g. 'NBA'). */
  league?: string;
  /** Max fixtures to return. */
  limit?: number;
  /** "now" override for deterministic tests; defaults to Date.now(). */
  now?: number;
}

/** The authoritative final result of a fixture. */
export interface FixtureResult {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  winner: 'home' | 'away' | 'draw';
}

/** The vendor-agnostic seam every consumer depends on. */
export interface SportsProvider {
  /** Fixtures that have not started yet (status 'scheduled'). */
  listUpcoming(opts?: ListFixturesOptions): Promise<Fixture[]>;
  /** Fixtures currently in progress (status 'live', with score + period/clock). */
  listLive(opts?: ListFixturesOptions): Promise<Fixture[]>;
  /** The final result for a fixture, or null if it is not final yet / unknown. */
  getResult(fixtureId: string): Promise<FixtureResult | null>;
}

// ─── League catalog the mock draws from ─────────────────────────────────────────

interface LeagueDef {
  league: string;
  sport: string;
  /** Pool of team names; the mock pairs them up. */
  teams: string[];
  /** Whether ties are possible (football yes; basketball/MMA no). */
  drawsPossible: boolean;
  /** Typical per-side score range [min, max] for a believable final. */
  scoreRange: [number, number];
  /** Period labels cycled through as a live fixture progresses. */
  periods: string[];
}

const LEAGUES: LeagueDef[] = [
  {
    league: 'NBA',
    sport: 'basketball',
    teams: ['Lakers', 'Celtics', 'Warriors', 'Bucks', 'Nuggets', 'Heat', 'Suns', 'Mavericks'],
    drawsPossible: false,
    scoreRange: [92, 128],
    periods: ['Q1', 'Q2', 'Half', 'Q3', 'Q4'],
  },
  {
    league: 'EPL',
    sport: 'football',
    teams: ['Arsenal', 'Man City', 'Liverpool', 'Chelsea', 'Spurs', 'Man Utd', 'Newcastle', 'Aston Villa'],
    drawsPossible: true,
    scoreRange: [0, 4],
    periods: ["15'", "30'", 'Half', "60'", "75'"],
  },
  {
    league: 'UFC',
    sport: 'mma',
    teams: ['Adesanya', 'Pereira', 'Makhachev', 'Volkanovski', 'Edwards', 'Jones', 'Aspinall', 'Du Plessis'],
    drawsPossible: false,
    scoreRange: [0, 3], // rounds won
    periods: ['R1', 'R2', 'R3', 'R4', 'R5'],
  },
  {
    league: 'LaLiga',
    sport: 'football',
    teams: ['Real Madrid', 'Barcelona', 'Atletico', 'Sevilla', 'Valencia', 'Betis', 'Villarreal', 'Sociedad'],
    drawsPossible: true,
    scoreRange: [0, 4],
    periods: ["15'", "30'", 'Half', "60'", "75'"],
  },
  {
    league: 'MLB',
    sport: 'baseball',
    teams: ['Yankees', 'Dodgers', 'Astros', 'Braves', 'Mets', 'Cubs', 'Padres', 'Red Sox'],
    drawsPossible: false,
    scoreRange: [0, 11],
    periods: ['1st', '3rd', '5th', '7th', '9th'],
  },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A live fixture's notional duration (start → final) used to fake a clock. */
const FIXTURE_DURATION_MS = 2 * HOUR_MS;

/** Deterministic 32-bit hash of a string (FNV-1a) → stable seed per fixtureId. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A deterministic PRNG stream from a seed (mulberry32). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInt(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}

/** A stable fixture id for a (league, slot) pair. */
function fixtureIdFor(league: string, slot: number): string {
  return `mock_${league.toLowerCase()}_${slot}`;
}

/**
 * The deterministic schedule: each league plays one fixture per ~6h "slot".
 * Slot N's kickoff is anchored to the day so the same id maps to the same
 * start/teams every call — only the live score/clock advances with the clock.
 */
function slotStart(daySlot0: number, slot: number): number {
  return daySlot0 + slot * 6 * HOUR_MS;
}

/** Build the canonical (start-only) fixture for a league + slot. */
function buildFixture(def: LeagueDef, slot: number, startsAt: number): Fixture {
  const id = fixtureIdFor(def.league, slot);
  const r = rng(hashSeed(id));
  const home = def.teams[pickInt(r, 0, def.teams.length - 1)];
  let away = def.teams[pickInt(r, 0, def.teams.length - 1)];
  // Avoid a team playing itself.
  let guard = 0;
  while (away === home && guard++ < 8) away = def.teams[pickInt(r, 0, def.teams.length - 1)];
  return {
    fixtureId: id,
    league: def.league,
    sport: def.sport,
    homeTeam: home,
    awayTeam: away,
    homeLogo: logoFor(home),
    awayLogo: logoFor(away),
    startsAt,
    status: 'scheduled',
    homeScore: null,
    awayScore: null,
    period: null,
    winner: null,
  };
}

/** A deterministic placeholder logo url (emoji-style avatar service, no key). */
function logoFor(team: string): string {
  const slug = encodeURIComponent(team);
  return `https://api.dicebear.com/7.x/initials/png?seed=${slug}&backgroundType=gradientLinear`;
}

/** Compute the in-progress score + period for a fixture that is currently live. */
function liveSnapshot(def: LeagueDef, base: Fixture, elapsedMs: number): Fixture {
  const r = rng(hashSeed(base.fixtureId) ^ 0x9e3779b9);
  const finalHome = pickInt(r, def.scoreRange[0], def.scoreRange[1]);
  const finalAway = pickInt(r, def.scoreRange[0], def.scoreRange[1]);
  const progress = Math.max(0, Math.min(1, elapsedMs / FIXTURE_DURATION_MS));
  const periodIndex = Math.min(def.periods.length - 1, Math.floor(progress * def.periods.length));
  return {
    ...base,
    status: 'live',
    homeScore: Math.round(finalHome * progress),
    awayScore: Math.round(finalAway * progress),
    period: def.periods[periodIndex],
    winner: null,
  };
}

/** Compute the FINAL score for a fixture (deterministic from its id). */
function finalSnapshot(def: LeagueDef, base: Fixture): Fixture {
  const r = rng(hashSeed(base.fixtureId) ^ 0x9e3779b9);
  let finalHome = pickInt(r, def.scoreRange[0], def.scoreRange[1]);
  let finalAway = pickInt(r, def.scoreRange[0], def.scoreRange[1]);
  if (!def.drawsPossible && finalHome === finalAway) {
    // Break the tie deterministically.
    if (r() < 0.5) finalHome += 1;
    else finalAway += 1;
  }
  const winner: 'home' | 'away' | 'draw' =
    finalHome === finalAway ? 'draw' : finalHome > finalAway ? 'home' : 'away';
  return {
    ...base,
    status: 'final',
    homeScore: finalHome,
    awayScore: finalAway,
    period: 'Final',
    winner,
  };
}

/** Slots considered when generating: a window of recent + upcoming fixtures. */
const SLOTS = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The pilot provider. Pure + deterministic: no key, no network. Every call
 * derives state from `opts.now` (defaults to Date.now()) so the same instant
 * always yields the same fixtures, scores, and clocks.
 */
export class MockSportsProvider implements SportsProvider {
  /** Generate every fixture across all leagues/slots within the window. */
  private generateAll(now: number): { def: LeagueDef; fixture: Fixture; startsAt: number }[] {
    // Anchor slot 0 to today's local midnight (UTC is fine for the mock).
    const daySlot0 = Math.floor(now / DAY_MS) * DAY_MS;
    const out: { def: LeagueDef; fixture: Fixture; startsAt: number }[] = [];
    for (const def of LEAGUES) {
      for (const slot of SLOTS) {
        const startsAt = slotStart(daySlot0, slot);
        out.push({ def, fixture: buildFixture(def, slot, startsAt), startsAt });
      }
    }
    return out;
  }

  /** Resolve the current status/score for one generated fixture at `now`. */
  private project(def: LeagueDef, base: Fixture, now: number): Fixture {
    const elapsed = now - base.startsAt;
    if (elapsed < 0) return base; // scheduled
    if (elapsed >= FIXTURE_DURATION_MS) return finalSnapshot(def, base); // final
    return liveSnapshot(def, base, elapsed); // live
  }

  private filtered(opts: ListFixturesOptions | undefined): { def: LeagueDef; fixture: Fixture }[] {
    const now = opts?.now ?? Date.now();
    return this.generateAll(now)
      .filter(({ def }) => (opts?.sport ? def.sport === opts.sport : true))
      .filter(({ def }) => (opts?.league ? def.league === opts.league : true))
      .map(({ def, fixture }) => ({ def, fixture }));
  }

  async listUpcoming(opts?: ListFixturesOptions): Promise<Fixture[]> {
    const now = opts?.now ?? Date.now();
    const limit = opts?.limit ?? 50;
    return this.filtered(opts)
      .map(({ def, fixture }) => this.project(def, fixture, now))
      .filter((f) => f.status === 'scheduled')
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, limit);
  }

  async listLive(opts?: ListFixturesOptions): Promise<Fixture[]> {
    const now = opts?.now ?? Date.now();
    const limit = opts?.limit ?? 50;
    return this.filtered(opts)
      .map(({ def, fixture }) => this.project(def, fixture, now))
      .filter((f) => f.status === 'live')
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, limit);
  }

  async getResult(fixtureId: string): Promise<FixtureResult | null> {
    const now = Date.now();
    const match = this.generateAll(now).find(({ fixture }) => fixture.fixtureId === fixtureId);
    if (!match) return null;
    const projected = this.project(match.def, match.fixture, now);
    if (projected.status !== 'final') return null;
    return {
      fixtureId,
      homeScore: projected.homeScore ?? 0,
      awayScore: projected.awayScore ?? 0,
      winner: projected.winner ?? 'draw',
    };
  }
}

/** Singleton accessor — swap the implementation here behind an env flag later. */
let _instance: SportsProvider | null = null;
export function getSportsProvider(): SportsProvider {
  if (_instance) return _instance;
  // Future: if (process.env.SPORTS_PROVIDER === 'api-sports') _instance = new ApiSportsProvider();
  _instance = new MockSportsProvider();
  return _instance;
}
