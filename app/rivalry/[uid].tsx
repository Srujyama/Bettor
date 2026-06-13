/**
 * Rivalry — the head-to-head page between the current user and another player.
 * Shows the RivalryCard (record, net Chips), recent bets the rival created (a
 * place to find a shared bet), and a "Rematch / Challenge" CTA that opens the
 * challenge flow (a 1-v-1 head-to-head bet). All reads are live; the challenge
 * goes through fns.challengeFriend via the virality mutation hook.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { toast } from 'burnt';
import { Button, Card, EmptyState, Input, Pill, Screen, Txt } from '@/components/ui';
import { BetCard, RivalryCard } from '@/components/domain';
import { useChallengeFriend } from '@/features/social/virality';
import { useCurrentUser, useRivalry, useUser, useUserBets } from '@/hooks/data';
import { makeIdempotencyKey } from '@/shared/ids';
import { STAKE } from '@/shared/constants';
import type { Bet } from '@/shared/schemas';

export default function RivalryScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const otherUid = typeof uid === 'string' ? uid : '';
  const router = useRouter();

  const { data: me } = useCurrentUser();
  const { data: them, isLoading } = useUser(otherUid || null);
  const { data: rivalry } = useRivalry(otherUid || null);
  const { data: theirBets } = useUserBets(otherUid || null, 10);

  const [composing, setComposing] = useState(false);

  const isSelf = !!me && me.uid === otherUid;
  const lastBetAt = rivalry?.lastBetAt ?? null;

  return (
    <Screen>
      <Stack.Screen options={{ title: them?.displayName ? `vs ${them.displayName}` : 'Rivalry' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {!them && isLoading ? (
          <View className="items-center py-16">
            <Txt variant="body" muted>
              Loading…
            </Txt>
          </View>
        ) : !them ? (
          <View className="items-center py-16">
            <Txt variant="heading">Player not found</Txt>
          </View>
        ) : isSelf ? (
          <EmptyState emoji="🪞" title="That's you" subtitle="Pick a friend to see your head-to-head." />
        ) : (
          <>
            <RivalryCard
              rivalry={rivalry ?? null}
              me={{ uid: me?.uid ?? '', name: me?.displayName, photoURL: me?.photoURL ?? null }}
              them={{ uid: otherUid, name: them.displayName, photoURL: them.photoURL ?? null }}
            />

            {lastBetAt ? (
              <Txt variant="caption" muted className="px-1">
                Last clash {new Date(lastBetAt).toLocaleDateString()}
              </Txt>
            ) : (
              <Card className="items-center py-5">
                <Txt variant="caption" muted className="text-center">
                  No head-to-head bets settled yet. Challenge them to start the rivalry.
                </Txt>
              </Card>
            )}

            {/* Challenge / rematch CTA */}
            {composing ? (
              <ChallengeComposer
                friendUid={otherUid}
                friendName={them.displayName}
                myBalance={me?.chipsBalance ?? 0}
                onClose={() => setComposing(false)}
              />
            ) : (
              <Button
                label={(rivalry?.totalBets ?? 0) > 0 ? '⚔︎  Rematch' : '⚔︎  Challenge'}
                tone="coral"
                onPress={() => {
                  if (!me) {
                    toast({ title: 'Sign in to challenge', preset: 'error', haptic: 'error' });
                    return;
                  }
                  setComposing(true);
                }}
              />
            )}

            {/* Recent bets from the rival — a place to find a shared bet */}
            <View className="gap-2">
              <Txt variant="label" dim className="uppercase tracking-wide">
                Their recent bets
              </Txt>
              {(theirBets ?? []).length === 0 ? (
                <Card className="items-center py-5">
                  <Txt variant="caption" muted>
                    Nothing recent from {them.displayName}.
                  </Txt>
                </Card>
              ) : (
                <View className="gap-3">
                  {(theirBets ?? []).map((b: Bet) => (
                    <BetCard key={b.betId} bet={b} onPress={(betId) => router.push(`/bet/${betId}`)} />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function ChallengeComposer({
  friendUid,
  friendName,
  myBalance,
  onClose,
}: {
  friendUid: string;
  friendName: string;
  myBalance: number;
  onClose: () => void;
}) {
  const challenge = useChallengeFriend();
  const [title, setTitle] = useState('');
  const [stakeText, setStakeText] = useState(String(STAKE.MIN));
  const [mine, setMine] = useState('I win');
  const [theirs, setTheirs] = useState('You win');

  const stake = useMemo(() => {
    const n = Number(stakeText.replace(/[^0-9]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }, [stakeText]);

  const valid =
    title.trim().length >= 3 &&
    stake >= STAKE.MIN &&
    stake <= myBalance &&
    mine.trim().length > 0 &&
    theirs.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const day = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    challenge.mutate(
      {
        friendUid,
        title: title.trim(),
        stake,
        myOutcomeLabel: mine.trim(),
        theirOutcomeLabel: theirs.trim(),
        lockAt: nowMs + day,
        resolveBy: nowMs + 3 * day,
        idempotencyKey: makeIdempotencyKey(),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Card raised className="gap-3">
      <Txt variant="heading">Challenge {friendName}</Txt>
      <Input label="What's the bet?" placeholder="I'll outscore you this weekend" value={title} onChangeText={setTitle} maxLength={120} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Input label="Your side" value={mine} onChangeText={setMine} maxLength={60} />
        </View>
        <View className="flex-1">
          <Input label="Their side" value={theirs} onChangeText={setTheirs} maxLength={60} />
        </View>
      </View>
      <Input
        label="Stake (Chips)"
        keyboardType="number-pad"
        value={stakeText}
        onChangeText={setStakeText}
        error={stake > myBalance ? 'More than your balance' : null}
      />
      {stake > 0 && stake <= myBalance ? (
        <Pill label={`Pot if both in · ${(stake * 2).toLocaleString()} Chips`} tone="gold" />
      ) : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Cancel" tone="ghost" onPress={onClose} />
        </View>
        <View className="flex-1">
          <Button label="Send challenge" tone="coral" loading={challenge.isPending} disabled={!valid} onPress={submit} />
        </View>
      </View>
    </Card>
  );
}
