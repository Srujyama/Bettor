/**
 * ACTIVITY tab — the user's notifications. Rows render via ActivityRow's generic
 * shape; tapping deep-links to the referenced bet (or an explicit deepLink).
 * Notifications are marked read both in the local cache (instant) and persisted
 * via the firebase boundary — the security rules permit a user to patch ONLY the
 * `read` field on their own notification docs, so this is not a money write.
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
import { updateDocData, paths } from '@/lib/firebase';
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

  // Mark everything read once viewed — optimistic cache update + persist the
  // `read` flag for each unread notification (rules allow only this field).
  useEffect(() => {
    if (!hasUnread || !uid) return;
    const unread = (notifications ?? []).filter((n) => !n.read);
    const id = setTimeout(() => {
      qc.setQueryData<AppNotification[]>(['notifications', uid, 50], (prev) =>
        (prev ?? []).map((n) => (n.read ? n : { ...n, read: true })),
      );
      for (const n of unread) {
        updateDocData(`${paths.notifications(uid)}/${n.notifId}`, { read: true }).catch(
          () => undefined,
        );
      }
    }, 800);
    return () => clearTimeout(id);
  }, [hasUnread, qc, uid, notifications]);

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
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110 }}
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
