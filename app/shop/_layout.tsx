/**
 * Shop stack. Dark headers matching the app shell; individual screens set their
 * own titles via Stack.Screen / the static options below.
 */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function ShopLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Shop' }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
    </Stack>
  );
}
