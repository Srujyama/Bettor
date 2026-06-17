/** Crew (group) stack — dark headers + back button. The crew home sets its own
 * headerRight (settings gear) via Stack.Screen options, which needs the header on. */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function GroupLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Crew' }} />
      <Stack.Screen name="settings" options={{ title: 'Crew settings' }} />
      <Stack.Screen name="chat" options={{ title: 'Crew chat' }} />
    </Stack>
  );
}
