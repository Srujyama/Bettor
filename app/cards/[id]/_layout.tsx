/**
 * Stack for a single card session: the live ledger (index) + the settle-up
 * screen (modal). The detail screen renders its own header.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function CardSessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Home game' }} />
      <Stack.Screen name="settle" options={{ title: 'Settle up', presentation: 'modal' }} />
    </Stack>
  );
}
