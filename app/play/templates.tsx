/**
 * QUICK BETS — the template library + a one-tap "challenge a friend" composer.
 *
 *  • Templates: a curated list (weather / social / sports / gaming / "will X be
 *    late") that 1-tap prefills the existing create-bet modal via router params.
 *  • Challenge a friend: pick an accepted friend, name the two sides, set a stake
 *    and a lock window, and fire challengeFriend — which creates a
 *    WINNER_TAKE_ALL bet and escrows your stake server-side.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar, Button, Card, Input, Screen, Txt } from '@/components/ui';
import { SegmentedTabs, TemplateCard } from '@/components/domain';
import { useChallengeFriend } from '@/features/formats/hooks';
import { BET_TEMPLATES, openTemplate } from '@/features/formats/templates';
import { useFriends } from '@/hooks/data';
import { makeIdempotencyKey } from '@/shared/ids';
import { formatChips } from '@/shared/money';
import { STAKE, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import type { Friend } from '@/shared/schemas';

const TABS = ['Templates', 'Challenge'] as const;
type Tab = (typeof TABS)[number];

const HOUR = 60 * 60 * 1000;
const LOCK_PRESETS = [
  { label: '1 hour', ms: 1 * HOUR },
  { label: '24 hours', ms: 24 * HOUR },
  { label: '3 days', ms: 72 * HOUR },
];

const CATEGORY_LABEL: Record<string, string> = {
  weather: 'Weather',
  social: 'Social',
  sports: 'Sports',
  gaming: 'Gaming',
  custom: 'Custom',
  prop: 'Prop',
};

export default function TemplatesScreen() {
  const [tab, setTab] = useState<Tab>('Templates');

  return (
    <Screen edges={['bottom']}>
      <View className="px-4 pt-3">
        <SegmentedTabs tabs={TABS as unknown as string[]} value={tab} onChange={(t) => setTab(t as Tab)} />
      </View>
      {tab === 'Templates' ? <TemplatesTab /> : <ChallengeTab />}
    </Screen>
  );
}

function TemplatesTab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      <Txt variant="body" dim>
        Tap a prompt to open the create-bet wizard prefilled and ready.
      </Txt>
      {BET_TEMPLATES.map((t) => (
        <TemplateCard
          key={t.key}
          emoji={t.emoji}
          title={t.title}
          hint={t.hint}
          categoryLabel={CATEGORY_LABEL[t.category] ?? t.category}
          tone={t.tone}
          onPress={() => openTemplate(t)}
        />
      ))}
    </ScrollView>
  );
}

function ChallengeTab() {
  const { data: friends } = useFriends();
  const challenge = useChallengeFriend();

  const accepted = useMemo(
    () => (friends ?? []).filter((f) => f.status === 'accepted'),
    [friends],
  );

  const [friendUid, setFriendUid] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [myLabel, setMyLabel] = useState('Me');
  const [theirLabel, setTheirLabel] = useState('Them');
  const [stake, setStake] = useState('100');
  const [lockMs, setLockMs] = useState<number>(24 * HOUR);

  const stakeNum = Number(stake) || 0;
  const valid =
    !!friendUid &&
    title.trim().length >= 3 &&
    myLabel.trim().length >= 1 &&
    theirLabel.trim().length >= 1 &&
    Number.isInteger(stakeNum) &&
    stakeNum >= STAKE.MIN &&
    stakeNum <= STAKE.DEFAULT_MAX &&
    !challenge.isPending;

  const submit = async () => {
    if (!friendUid) return;
    const lockAt = Date.now() + lockMs;
    const res = await challenge.mutateAsync({
      friendUid,
      title: title.trim(),
      stake: stakeNum,
      myOutcomeLabel: myLabel.trim(),
      theirOutcomeLabel: theirLabel.trim(),
      lockAt,
      resolveBy: lockAt + 24 * HOUR,
      idempotencyKey: makeIdempotencyKey(),
    });
    const betId = (res as { betId?: string })?.betId;
    if (betId) router.replace(`/bet/${betId}`);
    else router.back();
  };

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2">
        <Txt variant="label" dim>
          Challenge who?
        </Txt>
        {accepted.length === 0 ? (
          <Txt variant="caption" muted>
            Add some friends first to challenge them head-to-head.
          </Txt>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {accepted.map((f: Friend) => {
              const active = friendUid === f.friendUid;
              return (
                <Pressable
                  key={f.friendUid}
                  onPress={() => setFriendUid(f.friendUid)}
                  className={`flex-row items-center gap-2 rounded-pill border px-2.5 py-1.5 ${
                    active ? 'border-coral/60 bg-coral/15' : 'border-hairline bg-surface-raised'
                  }`}
                >
                  <Avatar uri={f.photoURLCache} name={f.displayNameCache} size={22} />
                  <Txt variant="label" className={active ? 'text-coral' : 'text-text-dim'}>
                    {f.displayNameCache ?? 'Friend'}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <Input
        label="The bet"
        placeholder="e.g. I'll beat you at FIFA tonight"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />

      <View className="flex-row gap-3">
        <View className="flex-1">
          <Input label="Your side" value={myLabel} onChangeText={setMyLabel} maxLength={60} />
        </View>
        <View className="flex-1">
          <Input label="Their side" value={theirLabel} onChangeText={setTheirLabel} maxLength={60} />
        </View>
      </View>

      <Input
        label="Stake each (Chips)"
        value={stake}
        onChangeText={setStake}
        keyboardType="number-pad"
        prefix="🪙"
      />

      <View className="gap-2">
        <Txt variant="label" dim>
          Locks in
        </Txt>
        <View className="flex-row flex-wrap gap-2">
          {LOCK_PRESETS.map((p) => {
            const active = lockMs === p.ms;
            return (
              <Button
                key={p.label}
                label={p.label}
                tone={active ? 'coral' : 'ghost'}
                size="sm"
                fullWidth={false}
                onPress={() => setLockMs(p.ms)}
              />
            );
          })}
        </View>
      </View>

      <Card>
        <Txt variant="caption" muted>
          You stake {formatChips(stakeNum)} now; your friend matches it to accept. Winner takes the pot.
          {' '}
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </Card>

      <Button
        label="Send challenge"
        tone="coral"
        onPress={submit}
        loading={challenge.isPending}
        disabled={!valid}
      />
    </ScrollView>
  );
}
