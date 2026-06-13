/**
 * BET DETAIL — the live view of one bet. Header (title, creator, CountdownRing,
 * status), the PoolMeter + split, each outcome with its backers, a context-aware
 * primary action (join / your position / resolve), a comment thread with a
 * composer, and share. When the bet settles and the viewer won, it fires the
 * global win celebration once.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { toast } from 'burnt';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  Avatar,
  Button,
  Card,
  ChipCounter,
  CountdownRing,
  Input,
  Pill,
  Screen,
  Txt,
} from '@/components/ui';
import { PoolMeter, ReactionBar, type Reaction } from '@/components/domain';
import { usePostComment } from '@/features/bets/mutations';
import {
  useBet,
  useBetComments,
  useBetEntries,
  useCurrentUser,
  useSettlement,
} from '@/hooks/data';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { colors } from '@/theme';
import { BET_STATUS, RESOLUTION_MODE, type BetStatus } from '@/shared/constants';
import { formatChips } from '@/shared/money';
import type { BetEntry, Comment, Outcome } from '@/shared/schemas';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const STATUS_META: Record<BetStatus, { label: string; tone: PillTone }> = {
  [BET_STATUS.DRAFT]: { label: 'Draft', tone: 'muted' },
  [BET_STATUS.OPEN]: { label: 'Open for stakes', tone: 'jade' },
  [BET_STATUS.LOCKED]: { label: 'Locked', tone: 'royal' },
  [BET_STATUS.PENDING_RESOLUTION]: { label: 'Resolving', tone: 'gold' },
  [BET_STATUS.DISPUTED]: { label: 'Disputed', tone: 'coral' },
  [BET_STATUS.RESOLVED]: { label: 'Resolved', tone: 'gold' },
  [BET_STATUS.SETTLED]: { label: 'Settled', tone: 'muted' },
  [BET_STATUS.CANCELLED]: { label: 'Cancelled', tone: 'muted' },
  [BET_STATUS.VOIDED]: { label: 'Voided', tone: 'muted' },
};

export default function BetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const betId = id ?? null;
  const myUid = useSession((s) => s.uid);

  const { data: bet, isLoading } = useBet(betId);
  const { data: entries } = useBetEntries(betId);
  const { data: comments } = useBetComments(betId);
  const { data: settlement } = useSettlement(betId);
  const { data: me } = useCurrentUser();
  const postComment = usePostComment();
  const triggerCelebrate = useUi((s) => s.triggerCelebrate);

  const [commentText, setCommentText] = useState('');
  const celebratedRef = useRef(false);

  // Local-optimistic comment reactions. There is no reaction callable yet
  // (none exists in fns/*), so these live in component state only: the chosen
  // emoji per comment and its local count. They reset on reload — fine for the
  // pilot; swap to a callable + live read when one ships.
  const [reactions, setReactions] = useState<Record<string, Reaction>>({});

  const reactToComment = (commentId: string, emoji: Reaction) => {
    setReactions((prev) =>
      prev[commentId] === emoji
        ? (() => {
            const { [commentId]: _drop, ...rest } = prev;
            return rest;
          })()
        : { ...prev, [commentId]: emoji },
    );
  };

  const myEntry = useMemo(
    () => (entries ?? []).find((e) => e.uid === myUid) ?? null,
    [entries, myUid],
  );

  const entriesByOutcome = useMemo(() => {
    const map: Record<string, BetEntry[]> = {};
    for (const e of entries ?? []) {
      (map[e.outcomeId] ??= []).push(e);
    }
    return map;
  }, [entries]);

  // Fire the win celebration once when a settled bet pays the viewer a profit.
  useEffect(() => {
    if (!bet || !betId || celebratedRef.current) return;
    if (bet.status !== BET_STATUS.SETTLED || !settlement) return;
    const myPayout = settlement.payouts.find((p) => p.uid === myUid);
    if (myPayout && myPayout.profit > 0) {
      celebratedRef.current = true;
      triggerCelebrate(betId, myPayout.amount);
    }
  }, [bet, betId, settlement, myUid, triggerCelebrate]);

  if (isLoading || !bet) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Txt variant="body" dim>
            {isLoading ? 'Loading bet…' : 'Bet not found.'}
          </Txt>
        </View>
      </Screen>
    );
  }

  const statusMeta = STATUS_META[bet.status as BetStatus] ?? STATUS_META[BET_STATUS.OPEN];
  const isOpen = bet.status === BET_STATUS.OPEN;
  const isCreator = bet.creatorUid === myUid;
  const isLocked = bet.status === BET_STATUS.LOCKED;
  const isConsensus = bet.resolutionMode === RESOLUTION_MODE.CONSENSUS;
  const canIResolve = isLocked && (isCreator || isConsensus);

  const goPlace = (outcomeId?: string) => {
    const q = outcomeId ? `?betId=${bet.betId}&outcomeId=${outcomeId}` : `?betId=${bet.betId}`;
    router.push(`/(modals)/place-stake${q}`);
  };

  const share = async () => {
    const link = `chipd://bet/${bet.betId}?ref=${bet.shareCode}`;
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(link, { dialogTitle: bet.title });
      } else {
        await Clipboard.setStringAsync(link);
        toast({ title: 'Link copied', message: bet.shareCode, preset: 'done', haptic: 'success' });
      }
    } catch {
      await Clipboard.setStringAsync(link);
      toast({ title: 'Link copied', preset: 'done', haptic: 'success' });
    }
  };

  const sendComment = async () => {
    const text = commentText.trim();
    if (!text || !betId) return;
    setCommentText('');
    try {
      await postComment.mutateAsync({ betId, text });
    } catch {
      setCommentText(text); // restore on failure
    }
  };

  const myOutcomeLabel = myEntry
    ? bet.outcomes.find((o) => o.id === myEntry.outcomeId)?.label ?? '—'
    : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 18 }} keyboardShouldPersistTaps="handled">
        {/* Top bar */}
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Txt variant="label" dim>
              ‹ Back
            </Txt>
          </Pressable>
          <Pressable onPress={share} hitSlop={12} accessibilityLabel="Share bet">
            <Txt variant="label" className="text-jade">
              Share ↗
            </Txt>
          </Pressable>
        </View>

        {/* Header */}
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-2">
            <View className="flex-row flex-wrap items-center gap-2">
              <Pill label={bet.category} tone="muted" />
              <Pill label={statusMeta.label} tone={statusMeta.tone} />
            </View>
            <Txt variant="title" numberOfLines={4}>
              {bet.title}
            </Txt>
            {bet.description ? (
              <Txt variant="body" dim>
                {bet.description}
              </Txt>
            ) : null}
            <View className="mt-1 flex-row items-center gap-2">
              <Avatar uri={bet.creatorPhotoURL} name={bet.creatorName} size={22} />
              <Txt variant="caption" dim>
                {bet.creatorName ?? 'Someone'} · opened {formatDistanceToNowStrict(new Date(bet.createdAt), { addSuffix: true })}
              </Txt>
            </View>
          </View>
          <CountdownRing lockAt={bet.lockAt} createdAt={bet.createdAt} size={72} />
        </View>

        {/* Pool */}
        <PoolMeter bet={bet} mySide={myEntry?.outcomeId ?? null} />

        {/* Outcomes with backers */}
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Txt variant="label" dim className="uppercase tracking-widest">
              The sides
            </Txt>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/bet/${bet.betId}/participants`);
              }}
              hitSlop={8}
            >
              <Txt variant="caption" className="text-jade">
                All participants ›
              </Txt>
            </Pressable>
          </View>
          {bet.outcomes.map((outcome, i) => (
            <OutcomeRow
              key={outcome.id}
              outcome={outcome}
              index={i}
              pool={bet.poolByOutcome[outcome.id] ?? 0}
              backers={entriesByOutcome[outcome.id] ?? []}
              winning={bet.winningOutcomeId === outcome.id}
              mine={myEntry?.outcomeId === outcome.id}
              canJoin={isOpen && !myEntry}
              onJoin={() => goPlace(outcome.id)}
            />
          ))}
        </View>

        {/* Primary action / position */}
        {isOpen && !myEntry ? (
          <Button label="Join this bet" tone="jade" size="lg" onPress={() => goPlace()} />
        ) : null}

        {myEntry ? (
          <MyPosition entry={myEntry} outcomeLabel={myOutcomeLabel ?? '—'} settlement={settlement} myUid={myUid} canTopUp={isOpen} onTopUp={() => goPlace(myEntry.outcomeId)} />
        ) : null}

        {canIResolve ? (
          <Button
            label={isConsensus && !isCreator ? 'Vote on the outcome' : 'Resolve this bet'}
            tone="gold"
            size="lg"
            onPress={() => router.push(`/bet/${bet.betId}/resolve`)}
          />
        ) : null}

        {bet.status === BET_STATUS.PENDING_RESOLUTION || bet.status === BET_STATUS.RESOLVED ? (
          <Button
            label="Dispute the result"
            tone="ghost"
            onPress={() => router.push(`/bet/${bet.betId}/dispute`)}
          />
        ) : null}

        {/* Comments */}
        <View className="gap-3 border-t border-hairline pt-4">
          <Txt variant="label" dim className="uppercase tracking-widest">
            Table talk · {(comments ?? []).length}
          </Txt>
          {(comments ?? []).length === 0 ? (
            <Txt variant="caption" muted>
              No comments yet. Start the trash talk.
            </Txt>
          ) : (
            (comments ?? []).map((c) => (
              <CommentRow
                key={c.commentId}
                comment={c}
                mine={reactions[c.commentId] ?? null}
                onReact={(emoji) => reactToComment(c.commentId, emoji)}
              />
            ))
          )}

          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <Input
                placeholder="Say something…"
                value={commentText}
                onChangeText={setCommentText}
                maxLength={280}
                returnKeyType="send"
                onSubmitEditing={sendComment}
              />
            </View>
            <View className="w-20">
              <Button
                label="Send"
                tone="jade"
                size="sm"
                onPress={sendComment}
                loading={postComment.isPending}
                disabled={!commentText.trim() || postComment.isPending}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const SIDE_COLORS = [colors.jade, colors.coral, colors.gold, colors.royal, colors.muted];

function OutcomeRow({
  outcome,
  index,
  pool,
  backers,
  winning,
  mine,
  canJoin,
  onJoin,
}: {
  outcome: Outcome;
  index: number;
  pool: number;
  backers: BetEntry[];
  winning: boolean;
  mine: boolean;
  canJoin: boolean;
  onJoin: () => void;
}) {
  const accent = outcome.color ?? SIDE_COLORS[index % SIDE_COLORS.length];
  const shown = backers.slice(0, 5);
  const extra = backers.length - shown.length;

  return (
    <View
      className="gap-2 rounded-card border bg-surface p-4"
      style={{ borderColor: mine || winning ? accent : colors.hairline }}
    >
      <View className="flex-row items-center gap-2">
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />
        <Txt variant="heading" className="flex-1" numberOfLines={1}>
          {outcome.label}
        </Txt>
        {winning ? <Pill label="Winner" tone="jade" /> : null}
        {mine && !winning ? <Pill label="Your side" tone="royal" /> : null}
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          {shown.length > 0 ? (
            shown.map((b, i) => (
              <View key={b.uid} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <Avatar uri={b.photoURL} name={b.displayName} size={26} ring />
              </View>
            ))
          ) : (
            <Txt variant="caption" muted>
              No backers yet
            </Txt>
          )}
          {extra > 0 ? (
            <Txt variant="caption" dim className="ml-2">
              +{extra}
            </Txt>
          ) : null}
        </View>
        <Txt variant="label" style={{ color: accent }}>
          {formatChips(pool)} Chips
        </Txt>
      </View>

      {canJoin ? (
        <Pressable
          onPress={onJoin}
          className="mt-1 items-center rounded-chip border py-2.5"
          style={{ borderColor: `${accent}66`, backgroundColor: `${accent}14` }}
        >
          <Txt variant="label" style={{ color: accent }}>
            Back {outcome.label}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

function MyPosition({
  entry,
  outcomeLabel,
  settlement,
  myUid,
  canTopUp,
  onTopUp,
}: {
  entry: BetEntry;
  outcomeLabel: string;
  settlement: ReturnType<typeof useSettlement>['data'];
  myUid: string | null;
  canTopUp: boolean;
  onTopUp: () => void;
}) {
  const myPayout = settlement?.payouts.find((p) => p.uid === myUid);
  const settled = !!myPayout;

  return (
    <Card raised>
      <View className="flex-row items-center justify-between">
        <Txt variant="label" dim className="uppercase tracking-widest">
          Your position
        </Txt>
        <Pill label={entry.status} tone={entry.status === 'won' ? 'jade' : entry.status === 'lost' ? 'coral' : 'muted'} />
      </View>
      <View className="mt-2 flex-row items-end justify-between">
        <View>
          <Txt variant="caption" muted>
            On {outcomeLabel}
          </Txt>
          <ChipCounter value={entry.stake} size={28} color={colors.jade} />
        </View>
        <View className="items-end">
          <Txt variant="caption" muted>
            {settled ? 'Paid out' : 'Potential payout'}
          </Txt>
          <Txt variant="heading" style={{ color: colors.gold }}>
            {settled
              ? formatChips(myPayout?.amount ?? 0)
              : entry.payoutAmount != null
                ? formatChips(entry.payoutAmount)
                : '—'}
          </Txt>
        </View>
      </View>
      {canTopUp ? (
        <View className="mt-3">
          <Button label="Add to your stake" tone="ghost" size="sm" onPress={onTopUp} />
        </View>
      ) : null}
    </Card>
  );
}

function CommentRow({
  comment,
  mine,
  onReact,
}: {
  comment: Comment;
  mine: Reaction | null;
  onReact: (emoji: Reaction) => void;
}) {
  // Local-optimistic counts: the viewer's own reaction shows a single tally.
  const counts = useMemo<Partial<Record<string, number>>>(
    () => (mine ? { [mine]: 1 } : {}),
    [mine],
  );

  return (
    <View className="flex-row gap-3 py-1.5">
      <Avatar uri={comment.authorPhotoURL} name={comment.authorName} size={32} />
      <View className="flex-1 gap-2">
        <View>
          <View className="flex-row items-center gap-2">
            <Txt variant="label" numberOfLines={1}>
              {comment.authorName}
            </Txt>
            <Txt variant="caption" muted>
              {formatDistanceToNowStrict(new Date(comment.createdAt), { addSuffix: true })}
            </Txt>
          </View>
          <Txt variant="body">{comment.text}</Txt>
        </View>
        <ReactionBar counts={counts} mine={mine} onReact={onReact} />
      </View>
    </View>
  );
}
