/**
 * Rewards stack — the hyper-engagement hub (hourly drop, daily spin, chests,
 * streak meter). Dark headers matching the app shell, mirroring app/shop.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function RewardsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Rewards' }} />
    </Stack>
  );
}
