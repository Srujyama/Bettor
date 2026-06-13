/**
 * Crew chat — live message list (ChatBubble) plus a composer with text, a
 * sticker picker (only packs the user owns, from useInventory), a GIF picker
 * stub, and "share a bet" (pick one of your recent crew bets to drop into chat).
 * Sending goes through fns.sendChat (rate-limited + member-only server-side).
 * Reads are live via useCrewChat / useInventory.
 */
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, EmptyState, Input, Screen, Txt } from '@/components/ui';
import { ChatBubble, GifPickerStub, StickerPicker } from '@/components/domain';
import { useSendChat } from '@/features/social/virality';
import {
  useCrewChat,
  useCurrentUser,
  useGroup,
  useGroupBets,
  useInventory,
} from '@/hooks/data';
import { colors } from '@/theme';
import type { Bet } from '@/shared/schemas';

type Tray = 'none' | 'sticker' | 'gif' | 'bet';

export default function CrewChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : '';
  const router = useRouter();

  const { data: me } = useCurrentUser();
  const { data: group } = useGroup(groupId || null);
  const { data: messages } = useCrewChat(groupId || null);
  const { data: inventory } = useInventory();
  const { data: crewBets } = useGroupBets(groupId || null, 15);

  const sendChat = useSendChat();
  const [text, setText] = useState('');
  const [tray, setTray] = useState<Tray>('none');

  const myUid = me?.uid ?? '';
  const ordered = useMemo(() => messages ?? [], [messages]);

  const sendText = () => {
    const trimmed = text.trim();
    if (!groupId || trimmed.length === 0) return;
    sendChat.mutate({ groupId, text: trimmed }, { onSuccess: () => setText('') });
  };

  const sendSticker = (stickerKey: string) => {
    if (!groupId) return;
    sendChat.mutate({ groupId, stickerKey }, { onSuccess: () => setTray('none') });
  };

  const sendGif = (gifUrl: string) => {
    if (!groupId) return;
    sendChat.mutate({ groupId, gifUrl }, { onSuccess: () => setTray('none') });
  };

  const shareBet = (bet: Bet) => {
    if (!groupId) return;
    sendChat.mutate(
      { groupId, betRef: bet.betId, text: bet.title },
      { onSuccess: () => setTray('none') },
    );
  };

  const toggleTray = (t: Tray) => setTray((cur) => (cur === t ? 'none' : t));

  return (
    <Screen edges={['top']}>
      <Stack.Screen options={{ title: group?.name ? `${group.emoji ?? '💬'} ${group.name}` : 'Crew chat' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlashList
          data={ordered}
          keyExtractor={(m) => m.messageId}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          renderItem={({ item, index }) => {
            const prev = ordered[index - 1];
            const showAuthor = !prev || prev.authorUid !== item.authorUid;
            return (
              <ChatBubble
                message={item}
                myUid={myUid}
                showAuthor={showAuthor}
                onPressBet={(betId) => router.push(`/bet/${betId}`)}
              />
            );
          }}
          ListEmptyComponent={
            <View className="pt-24">
              <EmptyState
                emoji="💬"
                title="No messages yet"
                subtitle="Say something — start the trash talk."
              />
            </View>
          }
        />

        {/* Expandable tray */}
        {tray === 'sticker' ? (
          <View className="border-t border-hairline bg-surface px-3 py-3">
            <StickerPicker inventory={inventory ?? []} onPick={sendSticker} />
          </View>
        ) : tray === 'gif' ? (
          <View className="border-t border-hairline bg-surface px-3 py-3">
            <GifPickerStub onPick={sendGif} />
          </View>
        ) : tray === 'bet' ? (
          <View className="max-h-64 border-t border-hairline bg-surface px-3 py-3">
            <Txt variant="caption" muted className="mb-2 px-1 uppercase tracking-widest">
              Share a crew bet
            </Txt>
            {(crewBets ?? []).length === 0 ? (
              <Txt variant="caption" muted className="px-1">
                No crew bets to share yet.
              </Txt>
            ) : (
              <FlashList
                data={crewBets ?? []}
                keyExtractor={(b) => b.betId}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                renderItem={({ item }) => (
                  <Card onPress={() => shareBet(item)} className="flex-row items-center justify-between">
                    <Txt variant="label" numberOfLines={1} style={{ flex: 1 }}>
                      {item.title}
                    </Txt>
                    <Txt variant="caption" style={{ color: colors.gold }}>
                      Share
                    </Txt>
                  </Card>
                )}
              />
            )}
          </View>
        ) : null}

        {/* Composer */}
        <View className="flex-row items-end gap-2 border-t border-hairline bg-ink px-3 py-2">
          <TrayButton label="😏" active={tray === 'sticker'} onPress={() => toggleTray('sticker')} />
          <TrayButton label="GIF" active={tray === 'gif'} onPress={() => toggleTray('gif')} />
          <TrayButton label="🎲" active={tray === 'bet'} onPress={() => toggleTray('bet')} />
          <View className="flex-1">
            <Input
              placeholder="Message…"
              value={text}
              onChangeText={setText}
              onSubmitEditing={sendText}
              returnKeyType="send"
              maxLength={500}
              multiline
            />
          </View>
          <View style={{ width: 72 }}>
            <Button
              label="Send"
              tone="jade"
              size="sm"
              loading={sendChat.isPending}
              disabled={text.trim().length === 0}
              onPress={sendText}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function TrayButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-10 min-w-10 items-center justify-center rounded-chip border px-2 ${
        active ? 'border-jade/40 bg-jade/15' : 'border-hairline bg-surface-raised'
      }`}
    >
      <Txt variant="label" className={active ? 'text-jade' : 'text-text'}>
        {label}
      </Txt>
    </Pressable>
  );
}
