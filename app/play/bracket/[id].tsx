/**
 * BRACKET — the visual single-elimination tournament. The owner taps a
 * competitor in an undecided match to advance them; the final match auto-settles
 * the prize pool server-side. Spectators see the live graph read-only. State
 * streams in via the live read hook.
 */
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ChipCounter, Pill, Screen, Txt } from '@/components/ui';
import { BracketView } from '@/components/domain';
import { useBracket, useAdvanceBracket } from '@/features/formats/hooks';
import { useSession } from '@/stores/session';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import type { Bracket } from '@/shared/schemas-ext';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const STATUS_META: Record<Bracket['status'], { label: string; tone: PillTone }> = {
  open: { label: 'Open', tone: 'jade' },
  live: { label: 'Live', tone: 'royal' },
  settled: { label: 'Settled', tone: 'muted' },
};

export default function BracketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession((s) => s.uid);
  const { data: bracket, isLoading } = useBracket(id ?? null);
  const advance = useAdvanceBracket();

  if (!bracket) {
    return (
      <Screen edges={['bottom']}>
        <View className="flex-1 items-center justify-center p-8">
          <Txt variant="body" dim>
            {isLoading ? 'Loading bracket…' : 'Bracket not found.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  const meta = STATUS_META[bracket.status] ?? STATUS_META.live;
  // `creatorUid`/`champion` are server-written fields not in the frozen Bracket
  // zod schema; read them defensively off the live doc.
  const extra = bracket as { creatorUid?: string; champion?: string | null };
  const isOwner = extra.creatorUid === uid;
  const champion = extra.champion ?? null;
  const canAdvance = isOwner && bracket.status !== 'settled' && !advance.isPending;

  const onPickWinner = canAdvance
    ? (matchId: string, winnerName: string) => {
        void advance.mutateAsync({ bracketId: bracket.bracketId, matchId, winnerName });
      }
    : undefined;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <View className="gap-2 rounded-card border border-hairline bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Txt variant="heading" numberOfLines={2} className="flex-1">
              {bracket.title}
            </Txt>
            <Pill label={meta.label} tone={meta.tone} />
          </View>
          <View className="flex-row items-center justify-between border-t border-hairline pt-3">
            <View className="gap-0.5">
              <Txt variant="caption" muted className="uppercase tracking-wide">
                Prize pool
              </Txt>
              <ChipCounter value={bracket.poolTotal ?? 0} size={20} color={colors.gold} />
            </View>
            <View className="items-end gap-0.5">
              <Txt variant="caption" muted className="uppercase tracking-wide">
                Field
              </Txt>
              <Txt variant="heading" style={{ fontVariant: ['tabular-nums'] }}>
                {bracket.competitors.length}
              </Txt>
            </View>
          </View>
          {isOwner && bracket.status !== 'settled' ? (
            <Txt variant="caption" muted>
              Tap a name in any match to advance the winner.
            </Txt>
          ) : null}
        </View>

        <BracketView matches={bracket.matches} champion={champion} onPickWinner={onPickWinner} />

        {bracket.status === 'settled' && champion ? (
          <Txt variant="caption" className="text-center text-gold">
            🏆 {champion} took the {formatChips(bracket.poolTotal ?? 0)} prize.
          </Txt>
        ) : null}

        <Txt variant="caption" muted className="text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}
