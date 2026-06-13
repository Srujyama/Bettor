/**
 * Profile setup. Pick a display name + @handle (validated against the shared
 * handle regex) and an optional avatar. Writes:
 *   • handles/{handleLower}  — claim-once reservation ({ uid }) per the rules.
 *   • users/{uid}            — patch displayName + photoURL (the only profile
 *                              fields the security rules let the client touch).
 *
 * The server seeds a starter handle on sign-up; this screen lets the user claim
 * a nicer one. We reserve it in the handle registry and patch the editable
 * profile fields; the canonical handle field on the user doc is reconciled
 * server-side from the registry.
 */
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'burnt';
import { Screen, Txt, Button, Input, Avatar } from '@/components/ui';
import { colors } from '@/theme';
import {
  paths,
  getDocOnce,
  setDocData,
  updateDocData,
  storageService,
} from '@/lib/firebase';
import { useSession } from '@/stores/session';

const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

export default function ProfileSetup() {
  const uid = useSession((s) => s.uid);
  const profile = useSession((s) => s.profile);

  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Seed from the server-bootstrapped profile once it arrives.
  useEffect(() => {
    if (!profile) return;
    setDisplayName((cur) => (cur ? cur : profile.displayName === 'New Player' ? '' : profile.displayName));
    setHandle((cur) => (cur ? cur : profile.handle ?? ''));
    setAvatarUri((cur) => cur ?? profile.photoURL ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  const nameValid = displayName.trim().length >= 1 && displayName.trim().length <= 40;
  const handleValid = HANDLE_RE.test(handle);
  const canSubmit = nameValid && handleValid && !!uid;

  const handleError = useMemo(() => {
    if (!touched || handleValid || handle.length === 0) return null;
    if (handle.length < 3) return 'At least 3 characters.';
    if (handle.length > 20) return 'At most 20 characters.';
    return 'Lowercase letters, numbers and underscores only.';
  }, [touched, handleValid, handle]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast({
        title: 'Photo access needed',
        message: 'Enable photo access in Settings to add an avatar.',
        preset: 'none',
      });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]?.uri) setAvatarUri(res.assets[0].uri);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error('Not signed in.');
      const handleLower = handle.toLowerCase();

      // 1) Reserve the handle (claim-once). If it already points to us, that's fine.
      const existing = await getDocOnce<{ uid: string }>(paths.handle(handleLower));
      if (existing && existing.uid !== uid) {
        throw new Error('That handle is taken. Try another.');
      }
      if (!existing) {
        await setDocData(
          paths.handle(handleLower),
          { uid, handle: handleLower, createdAt: Date.now() },
          false, // create-only write the rules permit
        );
      }

      // 2) Upload avatar if a new local file was chosen.
      let photoURL: string | null = profile?.photoURL ?? null;
      if (avatarUri && !avatarUri.startsWith('http')) {
        photoURL = await storageService.uploadFromUri(
          storageService.storagePathForAvatar(uid),
          avatarUri,
        );
      }

      // 3) Patch the editable profile fields (rules whitelist displayName/photoURL).
      await updateDocData(paths.user(uid), {
        displayName: displayName.trim(),
        photoURL,
      });
    },
    onSuccess: () => {
      toast({ title: 'Profile saved', preset: 'done', haptic: 'success' });
      router.push('/(onboarding)/responsible-gaming');
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Could not save your profile.';
      toast({ title: 'Save failed', message: msg, preset: 'error', haptic: 'error' });
    },
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mt-10 gap-2">
            <Txt variant="title">Set up your profile</Txt>
            <Txt variant="body" dim>
              This is how friends will find you at the table.
            </Txt>
          </View>

          {/* Avatar */}
          <View className="mt-8 items-center">
            <Pressable onPress={pickAvatar} className="items-center gap-2">
              {avatarUri ? (
                <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden' }}>
                  <Image source={{ uri: avatarUri }} style={{ width: 96, height: 96 }} contentFit="cover" />
                </View>
              ) : (
                <Avatar name={displayName || handle || '?'} size={96} ring />
              )}
              <Txt variant="caption" className="text-royal">
                {avatarUri ? 'Change photo' : 'Add a photo'}
              </Txt>
            </Pressable>
          </View>

          <View className="mt-8 gap-4">
            <Input
              label="Display name"
              placeholder="Your name"
              autoCapitalize="words"
              maxLength={40}
              value={displayName}
              onChangeText={setDisplayName}
            />
            <Input
              label="Handle"
              prefix="@"
              placeholder="yourhandle"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              value={handle}
              onChangeText={(v) => {
                setHandle(v.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                if (!touched) setTouched(true);
              }}
              error={handleError}
            />
            <Txt variant="caption" muted>
              3–20 characters: lowercase letters, numbers and underscores.
            </Txt>
          </View>

          <View className="flex-1" />

          <View className="gap-3">
            <Button
              label="Continue"
              tone="jade"
              size="lg"
              loading={save.isPending}
              disabled={!canSubmit}
              onPress={() => {
                setTouched(true);
                save.mutate();
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
