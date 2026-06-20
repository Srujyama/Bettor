/**
 * Casino stack. Dark headers matching the app shell. Each game screen sets its
 * own title. Mirrors app/shop/_layout.tsx so routing stays consistent and we
 * never touch the root app/_layout.tsx.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function CasinoLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Casino' }} />
      <Stack.Screen name="slots" options={{ title: 'Slots' }} />
      <Stack.Screen name="wheel" options={{ title: 'Wheel of Fortune' }} />
      <Stack.Screen name="scratch" options={{ title: 'Scratch Card' }} />
      <Stack.Screen name="coinflip" options={{ title: 'Coin Flip' }} />
      <Stack.Screen name="crash" options={{ title: 'Crash' }} />
    </Stack>
  );
}
