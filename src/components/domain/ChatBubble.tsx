/**
 * ChatBubble — one crew-chat message. Own messages align right (jade-tinted),
 * others align left with the author's avatar + name. Renders text, a GIF, a
 * sticker (large emoji glyph from the owned pack), or a shared bet card stub
 * (tap to open the bet). Presentational: the ChatMessage + viewer uid in via
 * props; betRef taps bubble up via onPressBet.
 */
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Avatar, Txt } from '@/components/ui';
import { stickerGlyph } from './StickerPicker';
import { colors } from '@/theme';
import type { ChatMessage } from '@/shared/schemas-ext';

interface Props {
  message: ChatMessage;
  myUid: string;
  /** Show the author row (name + avatar) — suppress for consecutive messages. */
  showAuthor?: boolean;
  onPressBet?: (betId: string) => void;
}

export function ChatBubble({ message, myUid, showAuthor = true, onPressBet }: Props) {
  const mine = message.authorUid === myUid;
  const sticker = message.stickerKey ? stickerGlyph(message.stickerKey) : null;

  return (
    <View className={`w-full flex-row gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && showAuthor ? (
        <Avatar uri={message.authorPhotoURL} name={message.authorName} size={28} />
      ) : !mine ? (
        <View style={{ width: 28 }} />
      ) : null}

      <View className="max-w-[78%] gap-1">
        {!mine && showAuthor ? (
          <Txt variant="caption" muted className="px-1">
            {message.authorName}
          </Txt>
        ) : null}

        {sticker ? (
          // Stickers render "bare" (no bubble) at a large size.
          <Txt style={{ fontSize: 52, alignSelf: mine ? 'flex-end' : 'flex-start' }}>{sticker}</Txt>
        ) : message.gifUrl ? (
          <Image
            source={{ uri: message.gifUrl }}
            style={{ width: 180, height: 130, borderRadius: 14, backgroundColor: colors.surfaceSunken }}
            contentFit="cover"
          />
        ) : message.betRef ? (
          <Pressable
            onPress={() => message.betRef && onPressBet?.(message.betRef)}
            className="gap-1 rounded-card border border-gold/40 bg-gold/10 px-3 py-2.5"
          >
            <Txt variant="caption" style={{ color: colors.gold }} className="uppercase tracking-widest">
              Shared a bet
            </Txt>
            {message.text ? (
              <Txt variant="label" numberOfLines={2}>
                {message.text}
              </Txt>
            ) : (
              <Txt variant="label" dim>
                Tap to view
              </Txt>
            )}
          </Pressable>
        ) : (
          <View
            className="rounded-card px-3 py-2"
            style={{ backgroundColor: mine ? colors.jadeDim : colors.surfaceRaised }}
          >
            <Txt variant="body" style={mine ? { color: colors.jade } : undefined}>
              {message.text}
            </Txt>
          </View>
        )}
      </View>
    </View>
  );
}
