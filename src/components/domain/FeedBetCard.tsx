/**
 * FeedBetCard — a full-screen discovery card for a P2P bet. Title, creator, a
 * draining countdown, the pot, the TwoSidedBar split, and a one-tap "Join"
 * button that opens the QuickBetSheet. Tapping the body deep-links to the bet.
 */
import { Pressable, View } from 'react-native';
import { Avatar, Button, ChipCounter, CountdownRing, TwoSidedBar, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { HotBadge } from './HotBadge';
import { formatChips } from '@/shared/money';
import type { Bet } from '@/shared/schemas';

interface Props {
  bet: Bet;
  heat?: number;
  onOpen: (betId: string) => void;
  onQuickJoin: (bet: Bet) => void;
}

export function FeedBetCard({ bet, heat = 0, onOpen, onQuickJoin }: Props) {
  const segments = bet.outcomes.map((o) => ({
    outcomeId: o.id,
    label: o.label,
    amount: bet.poolByOutcome[o.id] ?? 0,
  }));

  return (
    <View className="flex-1 justify-between px-6 py-10">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <HotBadge heat={heat} label="Live bet" />
        <CountdownRing lockAt={bet.lockAt} createdAt={bet.createdAt} size={52} />
      </View>

      {/* Body */}
      <Pressable onPress={() => onOpen(bet.betId)} className="flex-1 justify-center">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          {bet.category}
        </Txt>
        <Txt variant="display" numberOfLines={5} className="mt-2">
          {bet.title}
        </Txt>

        <View className="mt-6 flex-row items-center gap-2">
          <Avatar uri={bet.creatorPhotoURL} name={bet.creatorName} size={28} />
          <Txt variant="caption" dim numberOfLines={1}>
            {bet.creatorName ?? 'Someone'}
          </Txt>
          <View className="flex-1" />
          <Txt variant="caption" muted>
            {bet.entryCount === 1 ? '1 in' : `${formatChips(bet.entryCount)} in`}
          </Txt>
        </View>

        <View className="mt-8 gap-3 border-t border-hairline pt-5">
          <View className="flex-row items-baseline justify-between">
            <Txt variant="caption" muted className="uppercase tracking-widest">
              Pot
            </Txt>
            <ChipCounter value={bet.poolTotal} size={28} color={colors.gold} />
          </View>
          <TwoSidedBar segments={segments} mySide={null} height={12} />
        </View>
      </Pressable>

      {/* Quick action */}
      <Button label="Join this bet" tone="jade" size="lg" onPress={() => onQuickJoin(bet)} />
    </View>
  );
}
