/**
 * ACTIVITY tab — the user's notifications. Rows render via ActivityRow's generic
 * shape; tapping deep-links to the referenced bet (or an explicit deepLink).
 * Notifications are marked read in the local cache when the list is viewed so the
 * unread dots clear — the authoritative read flag is owned by a Cloud Function
 * (no client write to it from here, per the firebase boundary).
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, Screen, Txt } from '@/components/ui';
import { ActivityRow } from '@/components/domain';
import { useNotifications } from '@/hooks/data';
import { useSession } from '@/stores/session';
import type { AppNotification } from '@/shared/schemas';

function notificationEmoji(type: string): string {
  if (type.includes('win')) return '💰';
  if (type.includes('resolve')) return '🏁';
  if (type.includes('comment')) return '💬';
  if (type.includes('friend')) return '👋';
  if (type.includes('join')) return '🤝';
  if (type.includes('dispute')) return '⚖️';
  return '🔔';
}

export default function ActivityScreen() {
  const uid = useSession((s) => s.uid);
  const qc = useQueryClient();
  const { data: notifications, isLoading } = useNotifications();

  const hasUnread = (notifications ?? []).some((n) => !n.read);

  // Mark everything read in the local cache once viewed.
  useEffect(() => {
    if (!hasUnread) return;
    const id = setTimeout(() => {
      qc.setQueryData<AppNotification[]>(['notifications', uid, 50], (prev) =>
        (prev ?? []).map((n) => (n.read ? n : { ...n, read: true })),
      );
    }, 800);
    return () => clearTimeout(id);
  }, [hasUnread, qc, uid]);

  const open = (n: AppNotification) => {
    if (n.deepLink) {
      router.push(n.deepLink as never);
    } else if (n.betId) {
      router.push(`/bet/${n.betId}`);
    }
  };

  return (
    <Screen>
      <View className="px-4 pt-2 pb-3">
        <Txt variant="title">Activity</Txt>
      </View>
      <FlashList
        data={notifications ?? []}
        keyExtractor={(n: AppNotification) => n.notifId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <ActivityRow
            emoji={notificationEmoji(item.type)}
            title={item.title}
            subtitle={item.body}
            time={item.createdAt}
            onPress={item.betId || item.deepLink ? () => open(item) : undefined}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View className="py-16 items-center">
              <Txt variant="body" dim>
                Loading…
              </Txt>
            </View>
          ) : (
            <EmptyState
              emoji="🔔"
              title="You're all caught up"
              subtitle="Bet invites, resolutions and wins will land here."
            />
          )
        }
      />
    </Screen>
  );
}
