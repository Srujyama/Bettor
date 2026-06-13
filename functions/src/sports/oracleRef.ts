/**
 * The `oracleRef` string on a bet is the seam between a bet and the sports data
 * that auto-resolves it. We keep it a flat, parseable string (the bet schema's
 * `oracleRef` is `string | null`) rather than a nested object so the existing
 * bet doc shape is untouched.
 *
 * Encoding: `fixture:<fixtureId>:<outcomeMapJson>`
 *   - <fixtureId>      the fixtures/{id} this bet tracks.
 *   - <outcomeMapJson> maps a fixture WINNER ('home'|'away'|'draw') to the bet's
 *                      outcome id, so oracleResolve can translate a final result
 *                      into the bet's `winningOutcomeId`.
 *
 * Kept tiny and dependency-free so it can be shared by createBetFromFixture
 * (writes it) and oracleResolve (reads it).
 */

export type FixtureWinner = 'home' | 'away' | 'draw';

export interface FixtureOracleRef {
  kind: 'fixture';
  fixtureId: string;
  /** Maps a final winner side → the bet outcome id that should win. */
  outcomeByWinner: Partial<Record<FixtureWinner, string>>;
}

const PREFIX = 'fixture:';

export function encodeFixtureOracleRef(ref: Omit<FixtureOracleRef, 'kind'>): string {
  return `${PREFIX}${ref.fixtureId}:${JSON.stringify(ref.outcomeByWinner)}`;
}

export function parseFixtureOracleRef(raw: string | null | undefined): FixtureOracleRef | null {
  if (!raw || !raw.startsWith(PREFIX)) return null;
  const body = raw.slice(PREFIX.length);
  const sep = body.indexOf(':');
  if (sep < 0) return null;
  const fixtureId = body.slice(0, sep);
  const mapJson = body.slice(sep + 1);
  if (!fixtureId) return null;
  let outcomeByWinner: Partial<Record<FixtureWinner, string>>;
  try {
    outcomeByWinner = JSON.parse(mapJson) as Partial<Record<FixtureWinner, string>>;
  } catch {
    return null;
  }
  return { kind: 'fixture', fixtureId, outcomeByWinner };
}
