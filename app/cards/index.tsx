/**
 * Card games — your home games. Lists sessions you host or play in (poker cash,
 * tournaments, blackjack, generic banker games), newest first, with a "New game"
 * button. All money shown is read-only and server-written; this screen only
 * navigates + reads.
 */
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, EmptyState, Screen, Txt } from '@/components/ui';
import { SessionCard } from '@/components/domain';
import { useCardSessions } from '@/hooks/data';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

export default function CardSessionsScreen() {
  const router = useRouter();
  const { data: sessions, isLoading } = useCardSessions();

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Card games' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 12 }}>
        <View className="gap-1">
          <Txt variant="title">Home games</Txt>
          <Txt variant="caption" muted>
            Log a poker night, blackjack table, or any card game — track buy-ins
            and settle who owes whom in one tap.
          </Txt>
        </View>

        {!isLoading && (!sessions || sessions.length === 0) ? (
          <View className="mt-10">
            <EmptyState
              emoji="🃏"
              title="No games yet"
              subtitle="Start a home game and invite your crew to track buy-ins together."
              actionLabel="New game"
              onAction={() => router.push('/cards/new')}
            />
          </View>
        ) : (
          <View className="gap-3">
            {(sessions ?? []).map((s) => (
              <SessionCard
                key={s.sessionId}
                session={s}
                onPress={() => router.push(`/cards/${s.sessionId}`)}
              />
            ))}
          </View>
        )}

        <Txt variant="caption" muted className="mt-4 text-center">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-ink/95 px-4 pb-8 pt-3">
        <Button label="＋ New game" tone="jade" onPress={() => router.push('/cards/new')} />
      </View>
    </Screen>
  );
}
