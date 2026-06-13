/**
 * Live-sports read hooks. Like the core `@/hooks/data` hooks, every one returns a
 * live (onSnapshot-backed) query via the shared low-level query hooks + the
 * centralized `paths`. Screens import ONLY from here for fixture reads — they
 * never touch Firestore directly.
 *
 * The `fixtures` collection is written exclusively by the scheduled functions
 * (syncFixtures / updateLiveScores); the client only reads.
 */
import { useMemo } from 'react';
import { orderBy, where, limit as fbLimit, type QueryConstraint } from 'firebase/firestore';
import { paths } from '@/lib/firebase/paths';
import { useCollectionQuery, useDocQuery } from '@/hooks/useFirestoreQuery';
import type { Fixture } from '@/shared/schemas-ext';

export interface FixtureFilter {
  /** Restrict to one sport id (e.g. 'basketball'). */
  sport?: string | null;
  /** Restrict to one league code (e.g. 'NBA'). */
  league?: string | null;
  /** Restrict to a status; omit for all. */
  status?: Fixture['status'] | null;
  max?: number;
}

/**
 * Fixtures matching a filter, ordered by kickoff. We bias the Firestore query to
 * the most selective equality (league > sport) + optional status, then sort by
 * startsAt. The composite indexes in firestore.indexes.json back these.
 */
export function useFixtures(filter: FixtureFilter = {}) {
  const { sport, league, status, max = 60 } = filter;

  const constraints = useMemo<QueryConstraint[]>(() => {
    const c: QueryConstraint[] = [];
    if (league) c.push(where('league', '==', league));
    else if (sport) c.push(where('sport', '==', sport));
    if (status) c.push(where('status', '==', status));
    c.push(orderBy('startsAt', 'asc'));
    c.push(fbLimit(max));
    return c;
  }, [sport, league, status, max]);

  return useCollectionQuery<Fixture>(
    ['fixtures', sport ?? 'all', league ?? 'all', status ?? 'all', max],
    paths.fixtures(),
    constraints,
    true,
  );
}

/** A single fixture, live. */
export function useFixture(fixtureId: string | null) {
  return useDocQuery<Fixture>(
    ['fixture', fixtureId],
    fixtureId ? paths.fixture(fixtureId) : null,
    !!fixtureId,
  );
}

/** Only the fixtures currently in progress, soonest first. */
export function useLiveFixtures(max = 40) {
  return useCollectionQuery<Fixture>(
    ['fixtures', 'live', max],
    paths.fixtures(),
    [where('status', '==', 'live'), orderBy('startsAt', 'asc'), fbLimit(max)],
    true,
  );
}

/**
 * Bets linked to a given fixture (created via createBetFromFixture, which
 * denormalizes `fixtureId` onto the bet). Equality-only query → backed by the
 * automatic single-field index; we sort newest-first on the client.
 */
export function useFixtureBets(fixtureId: string | null, max = 30) {
  const q = useCollectionQuery<FixtureLinkedBet>(
    ['bets', 'byFixture', fixtureId, max],
    fixtureId ? paths.bets() : null,
    [where('fixtureId', '==', fixtureId), fbLimit(max)],
    !!fixtureId,
  );
  const sorted = useMemo(
    () => [...(q.data ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [q.data],
  );
  return { ...q, data: sorted };
}

/** A bet doc as returned by the fixture-linked query (subset we touch here). */
export interface FixtureLinkedBet {
  betId: string;
  fixtureId?: string | null;
  createdAt: number;
}
