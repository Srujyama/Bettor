/**
 * Invite & connect modal. Three jobs:
 *  1. Search users by @handle (queries the users collection) and send friend requests.
 *  2. Show pending incoming requests (useFriends filtered) with accept / decline.
 *  3. Crews: create a new crew (fns.createGroup) or join one by invite code (fns.joinGroup).
 * All writes go through the social feature hooks → Cloud Functions.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { where, limit as fbLimit } from 'firebase/firestore';
import { Avatar, Button, Card, Input, Pill, Screen, Txt } from '@/components/ui';
import { SegmentedTabs } from '@/components/domain';
import { getCollectionOnce } from '@/lib/firebase';
import { paths } from '@/lib/firebase/paths';
import { useCurrentUser, useFriends } from '@/hooks/data';
import {
  useCreateGroup,
  useJoinGroup,
  useSendFriendRequest,
  useRespondFriendRequest,
} from '@/features/social/hooks';
import type { Friend, User } from '@/shared/schemas';

const TABS = ['Friends', 'Crews'] as const;
type Tab = (typeof TABS)[number];

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export default function InviteFriendsModal() {
  const [tab, setTab] = useState<Tab>('Friends');
  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Add friends & crews', presentation: 'modal' }} />
      <View className="px-4 pt-2">
        <SegmentedTabs tabs={[...TABS]} value={tab} onChange={(t) => setTab(t as Tab)} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 20 }}>
        {tab === 'Friends' ? <FriendsTab /> : <CrewsTab />}
      </ScrollView>
    </Screen>
  );
}

// ─── Friends ──────────────────────────────────────────────────────────────--

function FriendsTab() {
  const { data: me } = useCurrentUser();
  const { data: friends } = useFriends();
  const sendRequest = useSendFriendRequest();
  const respond = useRespondFriendRequest();

  const [handle, setHandle] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const incoming = useMemo<Friend[]>(
    () => (friends ?? []).filter((f) => f.status === 'pending_in'),
    [friends],
  );
  const edgeFor = (uid: string) => (friends ?? []).find((f) => f.friendUid === uid) ?? null;

  const cleaned = handle.trim().replace(/^@/, '').toLowerCase();
  const validQuery = HANDLE_RE.test(cleaned);

  const search = async () => {
    if (!validQuery) return;
    setSearching(true);
    setSearched(false);
    try {
      const users = await getCollectionOnce<User>(
        paths.users(),
        where('handle', '==', cleaned),
        fbLimit(10),
      );
      setResults(users.filter((u) => u.uid !== me?.uid));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  return (
    <View className="gap-5">
      {/* Search */}
      <View className="gap-2">
        <Txt variant="label" dim className="uppercase tracking-wide">
          Find by handle
        </Txt>
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Input
              prefix="@"
              placeholder="handle"
              autoCapitalize="none"
              autoCorrect={false}
              value={handle}
              onChangeText={setHandle}
              onSubmitEditing={search}
              returnKeyType="search"
              error={handle.length > 0 && !validQuery ? '3–20 letters, numbers or _' : null}
            />
          </View>
          <View style={{ width: 96 }}>
            <Button label="Search" tone="royal" loading={searching} disabled={!validQuery} onPress={search} />
          </View>
        </View>

        {searched && results.length === 0 ? (
          <Txt variant="caption" muted className="px-1">
            No one found with that handle.
          </Txt>
        ) : null}

        {results.map((u) => {
          const edge = edgeFor(u.uid);
          return (
            <Card key={u.uid} className="flex-row items-center gap-3">
              <Avatar uri={u.photoURL} name={u.displayName} size={40} />
              <View className="flex-1">
                <Txt variant="label" numberOfLines={1}>
                  {u.displayName}
                </Txt>
                <Txt variant="caption" muted>
                  @{u.handle}
                </Txt>
              </View>
              {edge?.status === 'accepted' ? (
                <Pill label="✓ Friends" tone="jade" />
              ) : edge?.status === 'pending_out' ? (
                <Pill label="Sent" tone="muted" />
              ) : edge?.status === 'pending_in' ? (
                <Button
                  label="Accept"
                  tone="jade"
                  size="sm"
                  fullWidth={false}
                  loading={respond.isPending}
                  onPress={() => respond.mutate({ fromUid: u.uid, accept: true })}
                />
              ) : (
                <Button
                  label="Add"
                  tone="jade"
                  size="sm"
                  fullWidth={false}
                  loading={sendRequest.isPending}
                  onPress={() => sendRequest.mutate({ targetUid: u.uid })}
                />
              )}
            </Card>
          );
        })}
      </View>

      {/* Pending incoming */}
      <View className="gap-2">
        <Txt variant="label" dim className="uppercase tracking-wide">
          Requests
        </Txt>
        {incoming.length === 0 ? (
          <Card className="items-center py-5">
            <Txt variant="caption" muted>
              No pending requests.
            </Txt>
          </Card>
        ) : (
          incoming.map((f) => (
            <Card key={f.friendUid} className="flex-row items-center gap-3">
              <Avatar uri={f.photoURLCache} name={f.displayNameCache} size={40} />
              <View className="flex-1">
                <Txt variant="label" numberOfLines={1}>
                  {f.displayNameCache ?? 'Someone'}
                </Txt>
                {f.handleCache ? (
                  <Txt variant="caption" muted>
                    @{f.handleCache}
                  </Txt>
                ) : null}
              </View>
              <View className="flex-row gap-2">
                <Button
                  label="Accept"
                  tone="jade"
                  size="sm"
                  fullWidth={false}
                  loading={respond.isPending}
                  onPress={() => respond.mutate({ fromUid: f.friendUid, accept: true })}
                />
                <Button
                  label="Decline"
                  tone="ghost"
                  size="sm"
                  fullWidth={false}
                  loading={respond.isPending}
                  onPress={() => respond.mutate({ fromUid: f.friendUid, accept: false })}
                />
              </View>
            </Card>
          ))
        )}
      </View>
    </View>
  );
}

// ─── Crews ────────────────────────────────────────────────────────────────--

function CrewsTab() {
  const router = useRouter();
  const createGroup = useCreateGroup();
  const joinGroup = useJoinGroup();

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎲');
  const [code, setCode] = useState('');

  const onCreate = () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) return;
    createGroup.mutate(
      { name: trimmed, emoji: emoji.trim() || '🎲' },
      {
        onSuccess: (res) => {
          setName('');
          router.replace(`/group/${res.groupId}`);
        },
      },
    );
  };

  const onJoin = () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) return;
    joinGroup.mutate(trimmed, {
      onSuccess: (res) => {
        setCode('');
        router.replace(`/group/${res.groupId}`);
      },
    });
  };

  return (
    <View className="gap-5">
      <Card className="gap-3">
        <Txt variant="heading">Create a crew</Txt>
        <View className="flex-row items-end gap-2">
          <View style={{ width: 64 }}>
            <Input label="Emoji" value={emoji} onChangeText={setEmoji} maxLength={2} className="text-center" />
          </View>
          <View className="flex-1">
            <Input label="Crew name" placeholder="Saturday Squad" value={name} onChangeText={setName} maxLength={40} />
          </View>
        </View>
        <Button
          label="Create crew"
          tone="jade"
          loading={createGroup.isPending}
          disabled={name.trim().length === 0}
          onPress={onCreate}
        />
      </Card>

      <Card className="gap-3">
        <Txt variant="heading">Join by code</Txt>
        <Input
          label="Invite code"
          placeholder="K7P2QX"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          maxLength={8}
        />
        <Button
          label="Join crew"
          tone="royal"
          loading={joinGroup.isPending}
          disabled={code.trim().length < 4}
          onPress={onJoin}
        />
      </Card>
    </View>
  );
}
