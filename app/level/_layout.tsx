/** Level/XP stack — dark headers + back button. */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function LevelLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Your Level' }} />
    </Stack>
  );
}
