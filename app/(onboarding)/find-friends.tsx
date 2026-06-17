/**
 * Find friends (optional, skippable). Search by exact @handle via the handle
 * registry, show the matched profile, and send a friend request through
 * fns.sendFriendRequest. Finishing (Done or Skip) marks the tutorial complete —
 * which is what flips the root RouteGuard over to the tabs.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Screen, Txt, Button, Input, Avatar, Card } from '@/components/ui';
import { paths, getDocOnce, fns } from '@/lib/firebase';
import { useSession } from '@/stores/session';
import { useOnboarding } from '@/stores/ui';
import type { User } from '@/shared/schemas';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

interface FoundUser {
  uid: string;
  displayName: string;
  handle: string;
  photoURL?: string | null;
}

export default function FindFriends() {
  const uid = useSession((s) => s.uid);
  const setTutorialDone = useOnboarding((s) => s.setTutorialDone);

  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FoundUser | null>(null);
  const [searched, setSearched] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const normalized = query.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const canSearch = HANDLE_RE.test(normalized);

  const search = useMutation({
    mutationFn: async (): Promise<FoundUser | null> => {
      const reg = await getDocOnce<{ uid: string }>(paths.handle(normalized));
      if (!reg?.uid) return null;
      if (reg.uid === uid) throw new Error("That's you!");
      const u = await getDocOnce<User>(paths.user(reg.uid));
      if (!u) return null;
      return {
        uid: reg.uid,
        displayName: u.displayName,
        handle: u.handle,
        photoURL: u.photoURL ?? null,
      };
    },
    onSuccess: (res) => {
      setSearched(true);
      setFound(res);
    },
    onError: (e) => {
      setSearched(true);
      setFound(null);
      const msg = e instanceof Error ? e.message : 'Search failed.';
      toast({ title: msg, preset: 'none' });
    },
  });

  const sendRequest = useMutation({
    mutationFn: async (target: FoundUser) => {
      await fns.sendFriendRequest({ targetUid: target.uid });
      return target.uid;
    },
    onSuccess: (targetUid) => {
      setSentTo((prev) => new Set(prev).add(targetUid));
      toast({ title: 'Request sent', preset: 'done', haptic: 'success' });
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Could not send request.';
      toast({ title: 'Request failed', message: msg, preset: 'error', haptic: 'error' });
    },
  });

  const finish = () => {
    setTutorialDone(true);
    router.replace('/(tabs)');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between pt-4">
            <View />
            <Pressable onPress={finish} hitSlop={12}>
              <Txt variant="label" className="text-royal">
                Skip
              </Txt>
            </Pressable>
          </View>

          <View className="mt-6 gap-2">
            <Txt style={{ fontSize: 48 }}>👋</Txt>
            <Txt variant="title" className="mt-3">
              Find your people
            </Txt>
            <Txt variant="body" dim>
              Betting is more fun with friends. Look someone up by their @handle.
            </Txt>
          </View>

          <View className="mt-8 flex-row items-end gap-2">
            <View className="flex-1">
              <Input
                label="Search by handle"
                prefix="@"
                placeholder="theirhandle"
                autoCapitalize="none"
                autoCorrect={false}
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  setSearched(false);
                }}
                returnKeyType="search"
                onSubmitEditing={() => canSearch && search.mutate()}
              />
            </View>
            <View className="pb-0.5">
              <Button
                label="Search"
                tone="royal"
                size="md"
                fullWidth={false}
                loading={search.isPending}
                disabled={!canSearch}
                onPress={() => search.mutate()}
              />
            </View>
          </View>

          {/* Result */}
          {searched && !search.isPending ? (
            found ? (
              <Card raised className="mt-6 flex-row items-center gap-3">
                <Avatar uri={found.photoURL} name={found.displayName} size={48} />
                <View className="flex-1">
                  <Txt variant="heading">{found.displayName}</Txt>
                  <Txt variant="caption" dim>
                    @{found.handle}
                  </Txt>
                </View>
                <View style={{ width: 120 }}>
                  <Button
                    label={sentTo.has(found.uid) ? 'Sent' : 'Add'}
                    tone={sentTo.has(found.uid) ? 'ghost' : 'jade'}
                    size="sm"
                    loading={sendRequest.isPending}
                    disabled={sentTo.has(found.uid)}
                    onPress={() => sendRequest.mutate(found)}
                  />
                </View>
              </Card>
            ) : (
              <View className="mt-6 rounded-chip border border-hairline bg-surface p-4">
                <Txt variant="body" dim className="text-center">
                  No one found with that handle.
                </Txt>
              </View>
            )
          ) : null}

          <View className="flex-1" />

          <View className="mt-8">
            <Button label="Done" tone="jade" size="lg" onPress={finish} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
