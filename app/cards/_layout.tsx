/**
 * Card-games stack: the home-game list, the create-game screen, and a single
 * session (nested stack). Dark headers matching the app shell.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function CardsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Card games' }} />
      <Stack.Screen name="new" options={{ title: 'New game', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
