/**
 * Email sign-in / sign-up. Toggles between the two modes; on success the root
 * AuthGate observes the auth state change and routes onward (to onboarding for a
 * fresh account, to tabs for a returning, onboarded user). We never navigate
 * imperatively from here — that's the gate's job.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { FirebaseError } from 'firebase/app';
import { Screen, Txt, Button, Input } from '@/components/ui';
import { authService } from '@/lib/firebase';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

type Mode = 'signin' | 'signup';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(e: unknown): string {
  if (e instanceof FirebaseError) {
    switch (e.code) {
      case 'auth/invalid-email':
        return 'That email address looks off.';
      case 'auth/email-already-in-use':
        return 'An account already exists for that email. Try signing in.';
      case 'auth/weak-password':
        return 'Pick a password with at least 6 characters.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is incorrect.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Try again in a little while.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and retry.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function EmailAuth() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= 6;
  const canSubmit = emailValid && passwordValid;

  const mutation = useMutation({
    mutationFn: async () => {
      const e = email.trim().toLowerCase();
      if (mode === 'signup') return authService.signUpEmail(e, password);
      return authService.signInEmail(e, password);
    },
    onError: (e) => {
      const msg = friendlyAuthError(e);
      setError(msg);
      toast({ title: 'Could not continue', message: msg, preset: 'error', haptic: 'error' });
    },
    onSuccess: () => {
      // AuthGate handles routing. A toast keeps the moment feeling responsive.
      toast({
        title: mode === 'signup' ? 'Welcome to Chipd' : 'Welcome back',
        preset: 'done',
        haptic: 'success',
      });
    },
  });

  const submit = () => {
    setError(null);
    if (!canSubmit) {
      setError(!emailValid ? 'Enter a valid email.' : 'Password must be at least 6 characters.');
      return;
    }
    mutation.mutate();
  };

  const resetPassword = useMutation({
    mutationFn: async () => {
      if (!emailValid) throw new Error('Enter your email first so we know where to send it.');
      return authService.resetPassword(email.trim().toLowerCase());
    },
    onError: (e) =>
      toast({ title: 'Reset failed', message: friendlyAuthError(e), preset: 'error', haptic: 'error' }),
    onSuccess: () =>
      toast({ title: 'Check your inbox', message: 'Password reset link sent.', preset: 'done', haptic: 'success' }),
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center justify-between pt-4">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Txt variant="heading" muted>
                ‹ Back
              </Txt>
            </Pressable>
          </View>

          <View className="mt-10 gap-2">
            <Txt variant="title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</Txt>
            <Txt variant="body" dim>
              {mode === 'signup'
                ? 'A few seconds to set up, then 1,000 free Chips are yours.'
                : 'Sign in to get back to the action.'}
            </Txt>
          </View>

          {/* Mode toggle */}
          <View className="mt-8 flex-row rounded-chip border border-hairline bg-surface p-1">
            <SegBtn label="Sign in" active={mode === 'signin'} onPress={() => setMode('signin')} />
            <SegBtn label="Sign up" active={mode === 'signup'} onPress={() => setMode('signup')} />
          </View>

          <View className="mt-6 gap-4">
            <Input
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (error) setError(null);
              }}
            />
            <Input
              label="Password"
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (error) setError(null);
              }}
              error={error}
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            {mode === 'signin' ? (
              <Pressable onPress={() => resetPassword.mutate()} hitSlop={8} className="self-start">
                <Txt variant="caption" className="text-royal">
                  Forgot password?
                </Txt>
              </Pressable>
            ) : null}
          </View>

          <View className="mt-8">
            <Button
              label={mode === 'signup' ? 'Create account' : 'Sign in'}
              tone="jade"
              size="lg"
              loading={mutation.isPending}
              disabled={!canSubmit}
              onPress={submit}
            />
          </View>

          <View className="flex-1" />

          <Txt variant="caption" muted className="mt-8 text-center">
            By continuing you confirm you are 18+ and agree to play with Chips.
            {'\n'}
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SegBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-chip py-2.5 ${active ? 'bg-surface-raised' : ''}`}
    >
      <Txt variant="label" className={active ? 'text-text' : 'text-muted'}>
        {label}
      </Txt>
    </Pressable>
  );
}
