/**
 * Account settings — edit display name, view the (immutable) @handle and contact
 * fields, and sign out. Display name writes through useUpdateProfile; the handle
 * is claimed once during onboarding and is rules-protected, so it is read-only
 * here. Sign-out calls authService.signOut then resets the session store.
 */
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { authService } from '@/lib/firebase';
import { useSession } from '@/stores/session';
import { useOnboarding } from '@/stores/ui';
import { useCurrentUser } from '@/hooks/data';
import { useUpdateProfile } from '@/features/social/hooks';

export default function AccountSettings() {
  const router = useRouter();
  const resetSession = useSession((s) => s.reset);
  const setDevBypass = useOnboarding((s) => s.setDevBypass);
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState(user?.displayName ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Hydrate the field once the user doc arrives, unless the user has edited it.
  useEffect(() => {
    if (user?.displayName && !nameTouched && name === '') setName(user.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.displayName]);

  const trimmed = name.trim();
  const nameValid = trimmed.length >= 1 && trimmed.length <= 40;
  const nameChanged = !!user && trimmed !== user.displayName;

  const saveName = () => {
    if (!nameValid || !nameChanged) return;
    updateProfile.mutate({ displayName: trimmed });
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authService.signOut();
      resetSession();
      setDevBypass(false); // clear the dev onboarding bypass on sign-out
      router.replace('/(auth)');
    } catch {
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        <Card className="gap-3">
          <Input
            label="Display name"
            value={name}
            onChangeText={(t) => {
              setNameTouched(true);
              setName(t);
            }}
            maxLength={40}
            placeholder="Your name"
            error={name.length > 0 && !nameValid ? '1–40 characters' : null}
          />
          <Button
            label="Save name"
            tone="jade"
            loading={updateProfile.isPending}
            disabled={!nameValid || !nameChanged}
            onPress={saveName}
          />
        </Card>

        <Card className="gap-3">
          <Field label="Handle" value={user?.handle ? `@${user.handle}` : '—'} />
          <Field label="Email" value={user?.email ?? '—'} />
          <Field label="Phone" value={user?.phoneNumber ?? '—'} />
          <Field label="Region" value={user?.region ?? '—'} />
          <Txt variant="caption" muted>
            Your handle is set once at sign-up and can't be changed here.
          </Txt>
        </Card>

        <Button label="Sign out" tone="danger" loading={signingOut} onPress={confirmSignOut} />

        <Txt variant="caption" muted className="text-center">
          {user?.uid ? `User ID ${user.uid}` : ''}
        </Txt>
      </ScrollView>
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Txt variant="body" dim>
        {label}
      </Txt>
      <Txt variant="label" numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}
