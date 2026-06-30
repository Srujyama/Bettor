/**
 * SessionCard — a row in the "your home games" list. Shows the title, game-type
 * pill, a Chips/Tracking badge, the pot, the player count, and a status chip.
 * Presentational only; taps route to the live session.
 */
import { View } from 'react-native';
import { Card, Pill, Txt } from '@/components/ui';
import { GameTypePill } from './GameTypePill';
import { formatChips } from '@/shared/money';
import type { CardSession } from '@/shared/schemas-cards';

interface Props {
  session: CardSession;
  onPress?: () => void;
}

const STATUS_META: Record<CardSession['status'], { label: string; tone: 'jade' | 'coral' | 'gold' | 'muted' }> = {
  open: { label: 'Live', tone: 'jade' },
  settling: { label: 'Settling', tone: 'gold' },
  settled: { label: 'Settled', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'coral' },
};

export function SessionCard({ session, onPress }: Props) {
  const status = STATUS_META[session.status] ?? STATUS_META.open;
  const isChips = session.mode === 'chips';

  return (
    <Card onPress={onPress} className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Txt variant="heading" numberOfLines={1}>
            {session.title}
          </Txt>
          <Txt variant="caption" muted numberOfLines={1}>
            {session.playerCount} {session.playerCount === 1 ? 'player' : 'players'}
            {session.hostName ? ` · hosted by ${session.hostName}` : ''}
          </Txt>
        </View>
        <Pill label={status.label} tone={status.tone} />
      </View>

      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <GameTypePill gameType={session.gameType} />
          <Pill label={isChips ? '💎 Chips' : '📋 Tracking'} tone={isChips ? 'gold' : 'muted'} />
        </View>
        <View className="items-end">
          <Txt variant="caption" muted>
            Pot
          </Txt>
          <Txt variant="label" className="text-text font-semibold">
            {formatChips(session.pot)}
          </Txt>
        </View>
      </View>
    </Card>
  );
}
