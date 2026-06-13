import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ink },
        animation: 'slide_from_right',
        gestureEnabled: false, // onboarding is a forward-only flow
      }}
    >
      <Stack.Screen name="age-gate" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="responsible-gaming" />
      <Stack.Screen name="starter-chips" />
      <Stack.Screen name="find-friends" />
    </Stack>
  );
}
