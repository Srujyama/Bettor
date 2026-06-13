/**
 * ActivityRow — a single feed / notification row: avatar, title + subtitle, a
 * relative timestamp, and an optional Chip amount. Accepts either a FeedItem
 * document (it derives copy from the item type) or a generic shape for ad-hoc
 * notification rows. Presentational only.
 */
import { Pressable, View } from 'react-native';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { formatChips } from '@/shared/money';
import type { FeedItem } from '@/shared/schemas';

/** FeedItem.type → leading emoji + a verb fragment for the title. */
const FEED_COPY: Record<FeedItem['type'], { emoji: string; verb: string }> = {
  bet_created: { emoji: '🎯', verb: 'opened a bet' },
  bet_joined: { emoji: '🤝', verb: 'joined' },
  bet_resolving: { emoji: '⏳', verb: 'is resolving' },
  bet_settled: { emoji: '🏁', verb: 'settled' },
  big_win: { emoji: '💰', verb: 'won big on' },
  friend_joined: { emoji: '👋', verb: 'joined Chipd' },
  achievement: { emoji: '🏆', verb: 'unlocked an achievement' },
};

interface GenericRow {
  emoji?: string;
  title: string;
  subtitle?: string;
  /** epoch millis */
  time?: number;
  photoURL?: string | null;
  name?: string;
  amount?: number | null;
  onPress?: () => void;
}

type Props = { item: FeedItem; onPress?: (item: FeedItem) => void } | GenericRow;

function isFeedItem(p: Props): p is { item: FeedItem; onPress?: (item: FeedItem) => void } {
  return (p as { item?: FeedItem }).item !== undefined;
}

function relative(time?: number): string {
  if (!time) return '';
  return formatDistanceToNowStrict(new Date(time), { addSuffix: true });
}

export function ActivityRow(props: Props) {
  let emoji: string;
  let title: string;
  let subtitle: string | undefined;
  let time: number | undefined;
  let photoURL: string | null | undefined;
  let name: string | undefined;
  let amount: number | null | undefined;
  let onPress: (() => void) | undefined;
  let unread = false;

  if (isFeedItem(props)) {
    const { item } = props;
    const copy = FEED_COPY[item.type];
    emoji = copy.emoji;
    name = item.actorName;
    photoURL = item.actorPhotoURL;
    title = `${item.actorName} ${copy.verb}`;
    subtitle = item.betTitle ?? undefined;
    time = item.createdAt;
    amount = item.amount;
    unread = !item.read;
    onPress = props.onPress ? () => props.onPress?.(item) : undefined;
  } else {
    emoji = props.emoji ?? '🔔';
    title = props.title;
    subtitle = props.subtitle;
    time = props.time;
    photoURL = props.photoURL;
    name = props.name;
    amount = props.amount;
    onPress = props.onPress;
  }

  const body = (
    <View className="flex-row items-center gap-3 px-1 py-2.5">
      {photoURL || name ? (
        <Avatar uri={photoURL} name={name} size={40} />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-raised">
          <Txt style={{ fontSize: 20 }}>{emoji}</Txt>
        </View>
      )}
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          {photoURL || name ? <Txt style={{ fontSize: 14 }}>{emoji}</Txt> : null}
          <Txt variant="label" numberOfLines={1} className="flex-1">
            {title}
          </Txt>
        </View>
        {subtitle ? (
          <Txt variant="caption" dim numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View className="items-end gap-1">
        {typeof amount === 'number' ? (
          <Txt variant="label" style={{ color: colors.jade }}>
            +{formatChips(amount)}
          </Txt>
        ) : null}
        {time ? (
          <Txt variant="caption" muted>
            {relative(time)}
          </Txt>
        ) : null}
        {unread ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.jade }} />
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return <Pressable onPress={onPress}>{body}</Pressable>;
  }
  return body;
}
