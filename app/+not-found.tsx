/**
 * Fallback for unmatched routes / dead deep links. Keeps the user inside the app
 * with a clear way home rather than a dead end.
 */
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { Screen, EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <Screen>
        <View className="flex-1 items-center justify-center">
          <EmptyState
            emoji="🃏"
            title="This page folded"
            subtitle="The link you followed doesn't exist or has expired."
            actionLabel="Back to Chipd"
            onAction={() => router.replace('/(tabs)')}
          />
        </View>
      </Screen>
    </>
  );
}
