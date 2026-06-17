/**
 * Crew home — header (emoji + name + member count), the crew's bets as BetCards,
 * a "New bet in crew" CTA (deep-links the create-bet modal with this groupId),
 * and an invite button that shares the crew's inviteCode. Reads are live via
 * useGroup / useGroupBets; nothing here writes money.
 */
import { Share, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { toast } from '@/lib/toast';
import { Avatar, Button, Card, EmptyState, Pill, Screen, Txt } from '@/components/ui';
import { BetCard } from '@/components/domain';
import { useGroup, useGroupBets } from '@/hooks/data';
import type { Bet, Group } from '@/shared/schemas';

export default function GroupHomeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : '';
  const router = useRouter();

  const { data: group } = useGroup(groupId || null);
  const { data: bets, isLoading } = useGroupBets(groupId || null);

  const onShareInvite = async () => {
    if (!group) return;
    const message = `Join my crew "${group.name}" on Chipd. Invite code: ${group.inviteCode}`;
    try {
      const res = await Share.share({ message });
      if (res.action === Share.dismissedAction) return;
    } catch {
      // Sharing unavailable — copy the code instead.
      await Clipboard.setStringAsync(group.inviteCode);
      toast({ title: 'Invite code copied', preset: 'done', haptic: 'success' });
    }
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: group?.name ?? 'Crew',
          headerRight: () => (
            <Button
              label="⚙︎"
              tone="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => router.push(`/group/${groupId}/settings`)}
            />
          ),
        }}
      />
      <FlashList
        data={bets ?? []}
        keyExtractor={(b) => b.betId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          group ? (
            <GroupHeader group={group} onShareInvite={onShareInvite} onNewBet={() => router.push(`/(modals)/create-bet?groupId=${groupId}`)} />
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }: { item: Bet }) => (
          <BetCard bet={item} onPress={(betId) => router.push(`/bet/${betId}`)} />
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              emoji="🎲"
              title="No crew bets yet"
              subtitle="Start the first bet for this crew."
              actionLabel="New bet"
              onAction={() => router.push(`/(modals)/create-bet?groupId=${groupId}`)}
            />
          ) : null
        }
      />
    </Screen>
  );
}

function GroupHeader({
  group,
  onShareInvite,
  onNewBet,
}: {
  group: Group;
  onShareInvite: () => void;
  onNewBet: () => void;
}) {
  return (
    <View className="gap-4 pb-4 pt-2">
      <Card raised className="items-center gap-2 py-6">
        <View
          className="h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${group.coverColor}33` }}
        >
          <Txt style={{ fontSize: 34 }}>{group.emoji}</Txt>
        </View>
        <Txt variant="title" className="text-center">
          {group.name}
        </Txt>
        {group.description ? (
          <Txt variant="caption" dim className="text-center">
            {group.description}
          </Txt>
        ) : null}
        <Pill
          label={group.memberCount === 1 ? '1 member' : `${group.memberCount} members`}
          tone="royal"
        />
      </Card>

      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="New bet in crew" tone="jade" onPress={onNewBet} />
        </View>
        <View className="flex-1">
          <Button label="Invite" tone="ghost" onPress={onShareInvite} />
        </View>
      </View>

      <View className="flex-row items-center gap-2 px-1">
        <Avatar name={group.name} size={20} />
        <Txt variant="caption" muted>
          Invite code{'  '}
          <Txt variant="mono" className="text-text">
            {group.inviteCode}
          </Txt>
        </Txt>
      </View>
    </View>
  );
}
