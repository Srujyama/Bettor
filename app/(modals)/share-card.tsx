/**
 * Share Card modal — renders a beautiful, screenshot-able ShareableCard and lets
 * the user export it as an image (react-native-view-shot capture → expo-sharing).
 *
 * Params: ?type & id
 *   type=bet_result   id=<betId>      → WON/LOST card for the current user
 *   type=stat_flex    id=<statKey>    → a flex of one of the user's stats
 *   type=leaderboard  id=<seasonId>   → the user's current season standing
 *   type=wrapped      id=<periodId>   → a Wrapped slide
 *
 * Reads are live; nothing here writes money. Falls back to copying a deep link
 * if the platform share sheet is unavailable.
 */
import { useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { toast } from 'burnt';
import { Button, Screen, Txt } from '@/components/ui';
import { ShareableCard, type ShareCardData } from '@/components/domain';
import {
  useBet,
  useCurrentUser,
  useSeason,
  useSeasonStandings,
  useSettlement,
  useWrapped,
} from '@/hooks/data';
import { formatChips, formatChipsCompact } from '@/shared/money';

type ShareType = 'bet_result' | 'stat_flex' | 'leaderboard' | 'wrapped';

export default function ShareCardModal() {
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const type = (params.type ?? 'stat_flex') as ShareType;
  const id = params.id ?? '';

  const shotRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const { data: me } = useCurrentUser();

  // Pull whatever this card type needs (hooks always run; enabled gates by id).
  const { data: bet } = useBet(type === 'bet_result' ? id || null : null);
  const { data: settlement } = useSettlement(type === 'bet_result' ? id || null : null);
  const { data: seasons } = useSeason();
  const activeSeasonId = type === 'leaderboard' ? id || (seasons?.[0]?.seasonId ?? null) : null;
  const { data: standings } = useSeasonStandings(activeSeasonId, 200);
  const { data: wrapped } = useWrapped(type === 'wrapped' ? id || null : null);

  const cardData = useMemo<ShareCardData | null>(() => {
    const playerName = me?.displayName;
    switch (type) {
      case 'bet_result': {
        if (!bet) return null;
        const myPayout = settlement?.payouts?.find((p) => p.uid === me?.uid);
        const won = !!myPayout && myPayout.profit > 0;
        return {
          type: 'bet_result',
          won,
          title: bet.title,
          amount: won ? myPayout!.amount : 0,
          playerName,
        };
      }
      case 'leaderboard': {
        const mine = standings?.find((s) => s.uid === me?.uid);
        if (!mine) return null;
        return {
          type: 'leaderboard',
          rank: mine.rank,
          scopeLabel: seasons?.[0]?.name ?? 'Season',
          netChips: mine.netChips,
          playerName,
        };
      }
      case 'wrapped': {
        if (!wrapped) return null;
        return {
          type: 'wrapped',
          periodLabel: wrapped.periodLabel,
          headline: `${wrapped.netChips >= 0 ? '+' : '−'}${formatChipsCompact(Math.abs(wrapped.netChips))} net`,
          lines: [
            { label: 'Bets placed', value: String(wrapped.betsPlaced) },
            { label: 'Win rate', value: `${Math.round(wrapped.winRate * 100)}%` },
            { label: 'Biggest win', value: formatChipsCompact(wrapped.biggestWin) },
            { label: 'Longest streak', value: `${wrapped.longestStreak}` },
            { label: 'Top category', value: wrapped.favoriteCategory },
          ],
          playerName,
        };
      }
      case 'stat_flex':
      default: {
        if (!me) return null;
        const games = (me.winCount ?? 0) + (me.lossCount ?? 0);
        const winRate = games > 0 ? Math.round(((me.winCount ?? 0) / games) * 100) : 0;
        // `id` selects which stat to flex; default to win rate.
        const stat =
          id === 'streak'
            ? { statLabel: 'Current win streak', statValue: `${me.currentStreak ?? 0} 🔥`, subtitle: `Best ever: ${me.bestStreak ?? 0}` }
            : id === 'won'
              ? { statLabel: 'Lifetime Chips won', statValue: formatChipsCompact(me.lifetimeWon ?? 0), subtitle: `Across ${games} bets` }
              : id === 'level'
                ? { statLabel: 'Level', statValue: `${me.level ?? 1}`, subtitle: `${formatChips(me.xp ?? 0)} XP` }
                : { statLabel: 'Win rate', statValue: `${winRate}%`, subtitle: `${me.winCount ?? 0}–${me.lossCount ?? 0} record` };
        return { type: 'stat_flex', playerName, ...stat };
      }
    }
  }, [type, id, me, bet, settlement, standings, seasons, wrapped]);

  const onShare = async () => {
    if (!shotRef.current) return;
    setBusy(true);
    try {
      const uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your Chipd card' });
      } else {
        await Clipboard.setStringAsync('chipd://');
        toast({ title: 'Sharing unavailable', message: 'Saved to your device instead.', preset: 'none' });
      }
    } catch {
      toast({ title: "Couldn't create the image", preset: 'error', haptic: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Share', presentation: 'modal' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, alignItems: 'center' }}>
        {cardData ? (
          <ShareableCard ref={shotRef} data={cardData} />
        ) : (
          <View className="items-center py-24">
            <Txt variant="body" muted>
              Nothing to share here yet.
            </Txt>
          </View>
        )}

        {cardData ? (
          <View className="w-full max-w-sm gap-2">
            <Button label="Share card" tone="gold" loading={busy} onPress={onShare} />
            <Txt variant="caption" muted className="text-center">
              Chips are for entertainment only and have no real-world cash value.
            </Txt>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
