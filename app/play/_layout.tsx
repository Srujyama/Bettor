/**
 * Play stack — the game-formats surface (parlays, brackets, squares, templates,
 * challenge). Dark headers matching the app shell; each screen sets its own
 * title. Nested dynamic routes (parlay/[id], squares/[id], bracket/[id]) inherit
 * these options.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function PlayLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Play' }} />
      <Stack.Screen name="formats" options={{ title: 'Game formats' }} />
      <Stack.Screen name="parlay" options={{ title: 'Build a parlay' }} />
      <Stack.Screen name="parlay/[id]" options={{ title: 'Parlay slip' }} />
      <Stack.Screen name="squares/new" options={{ title: 'New squares board' }} />
      <Stack.Screen name="squares/[id]" options={{ title: 'Squares' }} />
      <Stack.Screen name="bracket/[id]" options={{ title: 'Bracket' }} />
      <Stack.Screen name="templates" options={{ title: 'Quick bets' }} />
    </Stack>
  );
}
