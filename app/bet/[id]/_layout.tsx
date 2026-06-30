/**
 * Stack for a single bet: the live detail view plus the resolve / dispute /
 * participants sub-screens. Headers are themed dark; the detail screen renders
 * its own header so we hide the native one there.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function BetStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="resolve" options={{ title: 'Resolve bet', presentation: 'modal' }} />
      <Stack.Screen name="dispute" options={{ title: 'Raise a dispute', presentation: 'modal' }} />
      <Stack.Screen name="participants" options={{ title: 'Participants' }} />
      <Stack.Screen name="offers" options={{ title: 'Odds book' }} />
    </Stack>
  );
}
