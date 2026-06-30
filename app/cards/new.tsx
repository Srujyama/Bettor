/**
 * New card game — create a home-game session. Pick a title, the card game, a
 * mode (Chips vs Just tracking) and a default buy-in, then route into the live
 * session. The client computes no money: createSession is a callable; the server
 * writes the session doc + adds you as host.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Input, Screen, Txt } from '@/components/ui';
import { GameTypePill } from '@/components/domain';
import { useCreateSession } from '@/features/cards/hooks';
import type { CardGameType } from '@/shared/schemas-cards';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const GAME_TYPES: CardGameType[] = ['poker_cash', 'poker_tournament', 'blackjack', 'generic'];

type Mode = 'chips' | 'tracking';

export default function NewSessionScreen() {
  const router = useRouter();
  const create = useCreateSession();

  const [title, setTitle] = useState('');
  const [gameType, setGameType] = useState<CardGameType>('poker_cash');
  const [mode, setMode] = useState<Mode>('chips');
  const [buyInText, setBuyInText] = useState('100');

  const defaultBuyIn = Math.max(0, Math.round(Number(buyInText) || 0));
  const canCreate = title.trim().length >= 1 && !create.isPending;

  const onCreate = () => {
    if (!canCreate) return;
    create.mutate(
      { title: title.trim(), gameType, mode, defaultBuyIn },
      {
        onSuccess: (res) => {
          const sessionId = (res as { sessionId?: string }).sessionId;
          if (sessionId) router.replace(`/cards/${sessionId}`);
          else router.back();
        },
      },
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New game' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <Input
            label="Game name"
            placeholder="Friday poker night"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            autoFocus
          />

          {/* Game type */}
          <View className="gap-2">
            <Txt variant="label" dim>
              Card game
            </Txt>
            <View className="flex-row flex-wrap gap-2">
              {GAME_TYPES.map((g) => {
                const active = g === gameType;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setGameType(g)}
                    className={`rounded-card border px-3 py-2 ${active ? 'border-jade/60 bg-jade/10' : 'border-hairline bg-surface'}`}
                  >
                    <GameTypePill gameType={g} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Mode toggle with explainer */}
          <View className="gap-2">
            <Txt variant="label" dim>
              Mode
            </Txt>
            <View className="flex-row gap-2">
              <ModeCard
                active={mode === 'chips'}
                onPress={() => setMode('chips')}
                emoji="💎"
                title="Chips"
                blurb="Buy-ins move real Chips. The pot is escrowed and paid out on settle."
              />
              <ModeCard
                active={mode === 'tracking'}
                onPress={() => setMode('tracking')}
                emoji="📋"
                title="Just tracking"
                blurb="No Chips move. A shared scoreboard for an in-person game — add guests too."
              />
            </View>
          </View>

          {/* Default buy-in */}
          <Input
            label="Default buy-in (Chips)"
            placeholder="100"
            value={buyInText}
            onChangeText={(t) => setBuyInText(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
          />

          <Button
            label={mode === 'chips' ? 'Start Chips game' : 'Start tracking'}
            tone="jade"
            onPress={onCreate}
            disabled={!canCreate}
            loading={create.isPending}
          />

          <Txt variant="caption" muted className="text-center">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ModeCard({
  active,
  onPress,
  emoji,
  title,
  blurb,
}: {
  active: boolean;
  onPress: () => void;
  emoji: string;
  title: string;
  blurb: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 gap-1 rounded-card border p-3 ${active ? 'border-jade/60 bg-jade/10' : 'border-hairline bg-surface'}`}
    >
      <Txt variant="label" className={active ? 'text-jade' : 'text-text'}>
        {emoji} {title}
      </Txt>
      <Txt variant="caption" muted>
        {blurb}
      </Txt>
    </Pressable>
  );
}
