/**
 * Markets stack — Kalshi-style prediction markets. Dark headers matching the app
 * shell; individual screens set their own titles via Stack.Screen.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function MarketsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Markets' }} />
      <Stack.Screen name="[id]" options={{ title: 'Market' }} />
      <Stack.Screen name="positions" options={{ title: 'Your positions' }} />
      <Stack.Screen name="create" options={{ title: 'New market', presentation: 'modal' }} />
    </Stack>
  );
}
