/**
 * Fallback for unmatched routes / dead deep links. Keeps the user inside the app
 * with a clear way home rather than a dead end.
 */
import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { Screen, EmptyState } from '@/components/ui';

export default function NotFound() {
  // Return to wherever the user came from, not always the home tabs. Fall back
  // to home only when there's no history to go back to (e.g. a cold deep-link
  // straight into a dead route). Previously this always replaced to /(tabs), so
  // hitting a dead end from any screen dumped you on the homepage.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <Screen>
        <View className="flex-1 items-center justify-center">
          <EmptyState
            emoji="🃏"
            title="This page folded"
            subtitle="The link you followed doesn't exist or has expired."
            actionLabel="Go back"
            onAction={goBack}
          />
        </View>
      </Screen>
    </>
  );
}
