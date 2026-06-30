/**
 * PlayerLedgerRow — one player on the session ledger: avatar + name, their
 * running buy-in total and (if recorded) cash-out, and a NetBadge for their
 * running net. Optional action slots (e.g. "Add buy-in", "Cash out") render on
 * the right. Presentational only — money is server-written.
 */
import { View } from 'react-native';
import { Avatar, Txt } from '@/components/ui';
import { NetBadge } from './NetBadge';
import { formatChips } from '@/shared/money';
import type { SessionPlayer } from '@/shared/schemas-cards';

interface Props {
  player: SessionPlayer & { isGuest?: boolean };
  /** Mark this row as "you". */
  isMe?: boolean;
  /** Mark this row as the host. */
  isHost?: boolean;
  /** Right-side action buttons (Add buy-in / Cash out), rendered by the screen. */
  actions?: React.ReactNode;
}

export function PlayerLedgerRow({ player, isMe, isHost, actions }: Props) {
  const buyIn = player.buyIn ?? 0;
  const cashOut = player.cashOut ?? null;
  // Live net: prefer the server net; else derive a provisional from cashOut.
  const net =
    typeof player.net === 'number'
      ? player.net
      : cashOut != null
        ? cashOut - buyIn
        : 0;
  const hasNet = typeof player.net === 'number' || cashOut != null;

  return (
    <View className="flex-row items-center gap-3 rounded-card border border-hairline bg-surface px-3 py-3">
      <Avatar uri={player.photoURL ?? undefined} name={player.displayName} size={40} ring={isHost} />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Txt variant="label" numberOfLines={1}>
            {player.displayName}
          </Txt>
          {isMe ? (
            <Txt variant="caption" className="text-jade">
              you
            </Txt>
          ) : null}
          {player.isGuest ? (
            <Txt variant="caption" muted>
              guest
            </Txt>
          ) : null}
        </View>
        <Txt variant="caption" muted numberOfLines={1}>
          In {formatChips(buyIn)}
          {cashOut != null ? ` · Out ${formatChips(cashOut)}` : ''}
          {player.place != null ? ` · #${player.place}` : ''}
        </Txt>
      </View>

      <View className="items-end gap-1">
        {hasNet ? <NetBadge net={net} size="md" /> : (
          <Txt variant="caption" muted>
            in play
          </Txt>
        )}
        {actions ? <View className="flex-row gap-1.5">{actions}</View> : null}
      </View>
    </View>
  );
}
