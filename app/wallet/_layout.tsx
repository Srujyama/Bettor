/** Wallet stack — dark headers + back button so the screen isn't a dead end. */
import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function WalletLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Wallet' }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
    </Stack>
  );
}
