/**
 * PARTICIPANTS — the full backer list, grouped by outcome with each side's pool
 * subtotal. Tapping a participant opens their profile.
 */
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar, EmptyState, Pill, Screen, Txt } from '@/components/ui';
import { useBet, useBetEntries } from '@/hooks/data';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import type { BetEntry, Outcome } from '@/shared/schemas';

type Row =
  | { kind: 'header'; outcome: Outcome; index: number; pool: number; count: number }
  | { kind: 'entry'; entry: BetEntry };

const SIDE_COLORS = [colors.jade, colors.coral, colors.gold, colors.royal, colors.muted];

export default function ParticipantsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const betId = id ?? null;

  const { data: bet } = useBet(betId);
  const { data: entries } = useBetEntries(betId);

  const rows = useMemo<Row[]>(() => {
    if (!bet) return [];
    const out: Row[] = [];
    bet.outcomes.forEach((outcome, index) => {
      const sideEntries = (entries ?? []).filter((e) => e.outcomeId === outcome.id);
      out.push({
        kind: 'header',
        outcome,
        index,
        pool: bet.poolByOutcome[outcome.id] ?? 0,
        count: sideEntries.length,
      });
      for (const e of sideEntries) out.push({ kind: 'entry', entry: e });
    });
    return out;
  }, [bet, entries]);

  if (!bet) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" dim>
            Loading…
          </Txt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <FlashList
        data={rows}
        keyExtractor={(r) => (r.kind === 'header' ? `h-${r.outcome.id}` : `e-${r.entry.uid}`)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        renderItem={({ item }) =>
          item.kind === 'header' ? (
            <View className="mb-2 mt-4 flex-row items-center gap-2">
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: SIDE_COLORS[item.index % SIDE_COLORS.length] }}
              />
              <Txt variant="heading" className="flex-1" numberOfLines={1}>
                {item.outcome.label}
              </Txt>
              <Pill label={`${formatChips(item.pool)} · ${item.count}`} tone="muted" />
            </View>
          ) : (
            <ParticipantRow entry={item.entry} />
          )
        }
        ListEmptyComponent={
          <EmptyState emoji="🪑" title="No one's in yet" subtitle="Be the first to take a side." />
        }
      />
    </Screen>
  );
}

function ParticipantRow({ entry }: { entry: BetEntry }) {
  return (
    <Pressable
      onPress={() => router.push(`/user/${entry.uid}`)}
      className="flex-row items-center gap-3 rounded-chip py-2.5"
    >
      <Avatar uri={entry.photoURL} name={entry.displayName} size={36} />
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {entry.displayName ?? 'Player'}
        </Txt>
        <Txt variant="caption" muted>
          {entry.status}
        </Txt>
      </View>
      <Txt variant="label" style={{ color: colors.gold }}>
        {formatChips(entry.stake)}
      </Txt>
    </Pressable>
  );
}
