/**
 * Settings stack. Dark headers matching the app shell; individual screens set
 * their own titles via Stack.Screen / the static options below.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="responsible-gaming" options={{ title: 'Responsible gaming' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="legal" options={{ title: 'Legal' }} />
    </Stack>
  );
}
