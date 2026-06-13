/**
 * GLOBAL SEARCH modal — one box that searches across people, open bets, crews,
 * and sports fixtures. All reads are live via the existing read hooks; matching
 * is client-side (fine for the pilot's data sizes). Each result deep-links to the
 * right detail screen. Nothing here writes money.
 *
 *   user     → /user/[id]
 *   bet      → /bet/[id]
 *   crew     → /group/[id]
 *   fixture  → /sports/[id]
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { orderBy, limit as fbLimit } from 'firebase/firestore';
import { EmptyState, Input, Screen, Txt } from '@/components/ui';
import { SearchResultRow } from '@/components/domain';
import { paths } from '@/lib/firebase/paths';
import { useCollectionQuery } from '@/hooks/useFirestoreQuery';
import { useDiscoverBets, useFixtures, useGroups } from '@/hooks/data';
import { formatChipsCompact } from '@/shared/money';
import { BET_STATUS } from '@/shared/constants';
import type { Group, User } from '@/shared/schemas';

/** How many candidates of each kind to pull for client-side filtering. */
const POOL = 50;
/** Cap each result section so a broad query can't render an enormous list. */
const SECTION_CAP = 8;

/** A slice of users to search by @handle / displayName (client-side filtered). */
function useSearchableUsers() {
  return useCollectionQuery<User>(
    ['search', 'users', POOL],
    paths.users(),
    [orderBy('createdAt', 'desc'), fbLimit(POOL)],
    true,
  );
}

export default function SearchModal() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const { data: users } = useSearchableUsers();
  const { data: bets } = useDiscoverBets(POOL);
  const { data: groups } = useGroups();
  const { data: fixtures } = useFixtures({}, POOL);

  const q = query.trim().toLowerCase();
  const active = q.length > 0;

  const userHits = useMemo(() => {
    if (!active) return [] as User[];
    return (users ?? [])
      .filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) || u.handle.toLowerCase().includes(q),
      )
      .slice(0, SECTION_CAP);
  }, [users, q, active]);

  const betHits = useMemo(() => {
    if (!active) return [];
    return (bets ?? [])
      .filter((b) => b.status === BET_STATUS.OPEN)
      .filter((b) => {
        const haystack = `${b.title} ${b.description} ${b.tags.join(' ')}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, SECTION_CAP);
  }, [bets, q, active]);

  const crewHits = useMemo(() => {
    if (!active) return [] as Group[];
    return (groups ?? [])
      .filter((g) => g.name.toLowerCase().includes(q))
      .slice(0, SECTION_CAP);
  }, [groups, q, active]);

  const fixtureHits = useMemo(() => {
    if (!active) return [];
    return (fixtures ?? [])
      .filter((f) => {
        const haystack = `${f.homeTeam} ${f.awayTeam} ${f.league} ${f.sport}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, SECTION_CAP);
  }, [fixtures, q, active]);

  const totalHits = userHits.length + betHits.length + crewHits.length + fixtureHits.length;

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Search', presentation: 'modal' }} />
      <View className="gap-3 px-4 pt-2">
        <Input
          placeholder="People, bets, crews, fixtures…"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!active ? (
          <EmptyState
            emoji="🔎"
            title="Search Chipd"
            subtitle="Find people by @handle, open bets, your crews, and live fixtures."
          />
        ) : totalHits === 0 ? (
          <EmptyState
            emoji="🤷"
            title="Nothing found"
            subtitle={`No people, bets, crews, or fixtures match “${query.trim()}”.`}
          />
        ) : (
          <>
            <Section title="People" count={userHits.length}>
              {userHits.map((u) => (
                <SearchResultRow
                  key={u.uid}
                  avatarUri={u.photoURL}
                  avatarName={u.displayName}
                  title={u.displayName}
                  subtitle={`@${u.handle}`}
                  badge="Person"
                  badgeTone="royal"
                  onPress={() => router.push(`/user/${u.uid}`)}
                />
              ))}
            </Section>

            <Section title="Open bets" count={betHits.length}>
              {betHits.map((b) => (
                <SearchResultRow
                  key={b.betId}
                  glyph="🎲"
                  title={b.title}
                  subtitle={`${formatChipsCompact(b.poolTotal)} pot · ${b.category}`}
                  badge="Bet"
                  badgeTone="jade"
                  onPress={() => router.push(`/bet/${b.betId}`)}
                />
              ))}
            </Section>

            <Section title="Crews" count={crewHits.length}>
              {crewHits.map((g) => (
                <SearchResultRow
                  key={g.groupId}
                  glyph={g.emoji}
                  title={g.name}
                  subtitle={g.memberCount === 1 ? '1 member' : `${g.memberCount} members`}
                  badge="Crew"
                  badgeTone="gold"
                  onPress={() => router.push(`/group/${g.groupId}`)}
                />
              ))}
            </Section>

            <Section title="Fixtures" count={fixtureHits.length}>
              {fixtureHits.map((f) => (
                <SearchResultRow
                  key={f.fixtureId}
                  glyph="🏟️"
                  title={`${f.homeTeam} vs ${f.awayTeam}`}
                  subtitle={`${f.league} · ${f.sport}`}
                  badge={f.status === 'live' ? 'Live' : 'Fixture'}
                  badgeTone={f.status === 'live' ? 'coral' : 'muted'}
                  onPress={() => router.push(`/sports/${f.fixtureId}`)}
                />
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <View className="gap-2">
      <Txt variant="label" dim className="uppercase tracking-widest">
        {title} · {count}
      </Txt>
      <View className="gap-2">{children}</View>
    </View>
  );
}
