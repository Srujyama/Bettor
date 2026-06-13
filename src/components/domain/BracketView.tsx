/**
 * BracketView — a horizontally-scrolling single-elimination bracket. Matches are
 * grouped into round columns; each match shows its two competitor slots with the
 * winner highlighted in jade. In creator mode (onPickWinner provided + match not
 * yet decided + both slots known) tapping a slot sets that competitor as the
 * winner. Presentational: the match graph is built server-side via seedBracket.
 */
import { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import type { Bracket } from '@/shared/schemas-ext';

type Match = Bracket['matches'][number];

interface Props {
  matches: Match[];
  champion?: string | null;
  /** Creator/admin mode: pick the winner of an undecided match. */
  onPickWinner?: (matchId: string, winnerName: string) => void;
}

const ROUND_LABELS = ['Round 1', 'Round 2', 'Quarterfinal', 'Semifinal', 'Final'];

function roundLabel(round: number, totalRounds: number): string {
  // Prefer the "from-the-end" naming for the late rounds.
  const fromEnd = totalRounds - 1 - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quarterfinal';
  return ROUND_LABELS[Math.min(round, ROUND_LABELS.length - 1)];
}

export function BracketView({ matches, champion, onPickWinner }: Props) {
  const rounds = useMemo(() => {
    const byRound = new Map<number, Match[]>();
    for (const m of matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    return Array.from(byRound.keys())
      .sort((a, b) => a - b)
      .map((r) => ({
        round: r,
        matches: (byRound.get(r) ?? []).sort((a, b) =>
          a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0,
        ),
      }));
  }, [matches]);

  const totalRounds = rounds.length;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, padding: 4 }}>
      {rounds.map((col) => (
        <View key={`round-${col.round}`} className="justify-center gap-4" style={{ width: 168 }}>
          <Txt variant="caption" muted className="uppercase tracking-widest">
            {roundLabel(col.round, totalRounds)}
          </Txt>
          {col.matches.map((m) => (
            <MatchCard key={m.matchId} match={m} onPickWinner={onPickWinner} />
          ))}
        </View>
      ))}

      {/* Champion column */}
      <View className="justify-center gap-4" style={{ width: 140 }}>
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Champion
        </Txt>
        <View className="rounded-card border border-gold/50 bg-gold/10 p-3">
          <Txt variant="heading" className="text-gold" numberOfLines={2}>
            {champion ?? 'TBD'}
          </Txt>
        </View>
      </View>
    </ScrollView>
  );
}

function MatchCard({
  match,
  onPickWinner,
}: {
  match: Match;
  onPickWinner?: (matchId: string, winnerName: string) => void;
}) {
  const decided = !!match.winnerName;
  const bothKnown = !!match.aName && !!match.bName;
  const canPick = !!onPickWinner && !decided && bothKnown;

  return (
    <View className="overflow-hidden rounded-card border border-hairline bg-surface">
      <Slot
        name={match.aName}
        isWinner={decided && match.winnerName === match.aName}
        canPick={canPick}
        onPick={() => match.aName && onPickWinner?.(match.matchId, match.aName)}
      />
      <View style={{ height: 1, backgroundColor: colors.hairline }} />
      <Slot
        name={match.bName}
        isWinner={decided && match.winnerName === match.bName}
        canPick={canPick}
        onPick={() => match.bName && onPickWinner?.(match.matchId, match.bName)}
      />
    </View>
  );
}

function Slot({
  name,
  isWinner,
  canPick,
  onPick,
}: {
  name: string | null;
  isWinner: boolean;
  canPick: boolean;
  onPick: () => void;
}) {
  const content = (
    <View className={`px-3 py-2.5 ${isWinner ? 'bg-jade/15' : ''}`}>
      <Txt
        variant="label"
        className={isWinner ? 'text-jade' : name ? 'text-text' : 'text-text-faint'}
        numberOfLines={1}
      >
        {name ?? 'TBD'}
      </Txt>
    </View>
  );

  if (canPick) {
    return (
      <Pressable onPress={onPick} accessibilityRole="button" accessibilityLabel={`Pick ${name} as winner`}>
        {content}
      </Pressable>
    );
  }
  return content;
}
