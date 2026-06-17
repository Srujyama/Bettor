/**
 * Crew settings — view crew details, copy/share the invite code, and leave the
 * crew. Leaving removes the caller's own membership doc (self-write allowed by
 * rules); the server reconciles memberCount via a trigger. There is no client
 * money path here.
 */
import { useState } from 'react';
import { Alert, ScrollView, Share, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { toast } from '@/lib/toast';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { setDocData, serverTimestamp } from '@/lib/firebase';
import { paths } from '@/lib/firebase/paths';
import { useSession } from '@/stores/session';
import { useGroup } from '@/hooks/data';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : '';
  const router = useRouter();
  const uid = useSession((s) => s.uid);
  const { data: group } = useGroup(groupId || null);
  const [leaving, setLeaving] = useState(false);

  const isOwner = !!group && !!uid && group.ownerUid === uid;

  const copyCode = async () => {
    if (!group) return;
    await Clipboard.setStringAsync(group.inviteCode);
    toast({ title: 'Invite code copied', preset: 'done', haptic: 'success' });
  };

  const shareInvite = async () => {
    if (!group) return;
    try {
      await Share.share({
        message: `Join my crew "${group.name}" on Chipd. Invite code: ${group.inviteCode}`,
      });
    } catch {
      await copyCode();
    }
  };

  const leave = async () => {
    if (!groupId || !uid) return;
    setLeaving(true);
    try {
      // Mark our own membership as left (merge write the rules allow on self).
      // The server reconciles memberCount and prunes the doc via a trigger.
      await setDocData(paths.groupMember(groupId, uid), { status: 'left', leftAt: serverTimestamp() });
      toast({ title: 'Left crew', preset: 'done', haptic: 'success' });
      router.replace('/(tabs)/profile');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Please try again';
      toast({ title: "Couldn't leave crew", message, preset: 'error', haptic: 'error' });
    } finally {
      setLeaving(false);
    }
  };

  const confirmLeave = () => {
    Alert.alert(
      isOwner ? 'Leave your own crew?' : 'Leave crew?',
      isOwner
        ? 'You own this crew. Leaving will remove you as a member.'
        : "You'll stop seeing this crew's bets.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: leave },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Crew settings' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {group ? (
          <>
            <Card className="items-center gap-2 py-6">
              <Txt style={{ fontSize: 40 }}>{group.emoji}</Txt>
              <Txt variant="title">{group.name}</Txt>
              {group.description ? (
                <Txt variant="caption" dim className="text-center">
                  {group.description}
                </Txt>
              ) : null}
              <Txt variant="caption" muted>
                {group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
              </Txt>
            </Card>

            <Card className="gap-3">
              <View className="flex-row items-center justify-between">
                <Txt variant="label" dim>
                  Invite code
                </Txt>
                <Txt variant="mono" className="text-text">
                  {group.inviteCode}
                </Txt>
              </View>
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button label="Copy code" tone="ghost" size="sm" onPress={copyCode} />
                </View>
                <View className="flex-1">
                  <Button label="Share invite" tone="royal" size="sm" onPress={shareInvite} />
                </View>
              </View>
            </Card>

            <Button label="Leave crew" tone="danger" loading={leaving} onPress={confirmLeave} />
          </>
        ) : (
          <View className="items-center py-16">
            <Txt variant="body" muted>
              Loading crew…
            </Txt>
          </View>
        )}

        <Txt variant="caption" muted className="text-center" style={{ color: colors.textFaint }}>
          Crew owners can manage members from the web console.
        </Txt>
      </ScrollView>
    </Screen>
  );
}
