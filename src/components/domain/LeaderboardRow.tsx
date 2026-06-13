/**
 * LeaderboardRow — rank, avatar, name, net Chips (jade if up, coral if down)
 * and a win-streak flame. Highlights when the row is the current user.
 * Presentational: takes a LeaderboardRow document via props.
 */
import { Pressable, View } from 'react-native';
import { Avatar, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import type { LeaderboardRow as LeaderboardRowData } from '@/shared/schemas';

interface Props {
  row: LeaderboardRowData;
  /** Emphasize this row when it represents the signed-in user. */
  highlight?: boolean;
  onPress?: (uid: string) => void;
}

/** Top three get medal-tinted rank chips; everyone else is muted. */
function rankTone(rank: number): string {
  if (rank === 1) return colors.gold;
  if (rank === 2) return colors.textDim;
  if (rank === 3) return colors.goldDeep;
  return colors.faint;
}

export function LeaderboardRow({ row, highlight, onPress }: Props) {
  const up = row.netChips >= 0;
  const netColor = up ? colors.jade : colors.coral;
  const streak = row.currentStreak;

  const body = (
    <View
      className={`flex-row items-center gap-3 rounded-card border px-3 py-2.5 ${
        highlight ? 'border-jade/40 bg-jade/10' : 'border-hairline bg-surface'
      }`}
    >
      <View style={{ width: 28, alignItems: 'center' }}>
        <Txt variant="heading" style={{ color: rankTone(row.rank) }}>
          {row.rank}
        </Txt>
      </View>
      <Avatar uri={row.photoURL} name={row.displayName} size={40} ring={highlight} />
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {row.displayName}
          {highlight ? ' · you' : ''}
        </Txt>
        <View className="flex-row items-center gap-2">
          {row.handle ? (
            <Txt variant="caption" muted>
              @{row.handle}
            </Txt>
          ) : null}
          <Txt variant="caption" muted>
            {Math.round(row.winRate * 100)}% wins
          </Txt>
          {streak > 0 ? (
            <Txt variant="caption" style={{ color: colors.gold }}>
              🔥 {streak}
            </Txt>
          ) : null}
        </View>
      </View>
      <View className="items-end">
        <Txt variant="heading" style={{ color: netColor }}>
          {up ? '+' : '−'}
          {formatChips(Math.abs(row.netChips))}
        </Txt>
        <Txt variant="caption" muted>
          net Chips
        </Txt>
      </View>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={() => onPress(row.uid)}>{body}</Pressable>;
  }
  return body;
}
