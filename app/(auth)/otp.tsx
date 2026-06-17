/**
 * OTP entry. Full 6-digit code UI with a resend cooldown. Because phone auth via
 * the Firebase JS SDK on RN requires a reCAPTCHA verifier we don't provision in
 * this Expo-Go pilot, "Verify" calls a placeholder that explains the limitation
 * and routes to the email path so the user is never stuck. When native phone auth
 * is wired, swap `verifyPlaceholder` for the real confirmation call — the UI is
 * already final.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { toast } from '@/lib/toast';
import { Screen, Txt, Button } from '@/components/ui';
import { colors } from '@/theme';

const CODE_LEN = 6;
const RESEND_SECONDS = 30;

export default function Otp() {
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = params.phone ?? 'your phone';

  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const hiddenInput = useRef<TextInput>(null);

  const filled = useMemo(() => code.padEnd(CODE_LEN, ' ').slice(0, CODE_LEN).split(''), [code]);
  const complete = code.length === CODE_LEN;

  useEffect(() => {
    // Focus the hidden field so the keyboard opens immediately.
    const id = setTimeout(() => hiddenInput.current?.focus(), 250);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const onChange = (raw: string) => {
    const next = raw.replace(/[^0-9]/g, '').slice(0, CODE_LEN);
    setCode(next);
    if (next.length === CODE_LEN) Haptics.selectionAsync();
  };

  const verifyPlaceholder = () => {
    // No live SMS provider in the pilot JS-SDK setup — explain and fall back.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    toast({
      title: 'Phone sign-in is finishing up',
      message: "We'll verify by phone soon. For now, continue with your email.",
      preset: 'none',
      haptic: 'warning',
    });
    router.replace('/(auth)/email');
  };

  const resend = () => {
    if (secondsLeft > 0) return;
    setSecondsLeft(RESEND_SECONDS);
    Haptics.selectionAsync();
    toast({ title: 'Code resent', message: `Sent again to ${phone}.`, preset: 'none' });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        <View className="flex-row items-center pt-4">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Txt variant="heading" muted>
              ‹ Back
            </Txt>
          </Pressable>
        </View>

        <View className="mt-10 gap-2">
          <Txt variant="title">Enter the code</Txt>
          <Txt variant="body" dim>
            We sent a 6-digit code to {phone}.
          </Txt>
        </View>

        {/* Tappable code boxes backed by one hidden input */}
        <Pressable onPress={() => hiddenInput.current?.focus()} className="mt-10">
          <View className="flex-row justify-between">
            {filled.map((ch, i) => {
              const active = i === Math.min(code.length, CODE_LEN - 1) && code.length < CODE_LEN;
              return (
                <View
                  key={i}
                  style={{
                    width: 48,
                    height: 60,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: active ? colors.jade : colors.hairline,
                    backgroundColor: colors.surfaceRaised,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Txt variant="title">{ch.trim()}</Txt>
                </View>
              );
            })}
          </View>
          <TextInput
            ref={hiddenInput}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={CODE_LEN}
            style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
          />
        </Pressable>

        <View className="mt-6 flex-row items-center gap-1">
          <Txt variant="caption" muted>
            Didn't get it?
          </Txt>
          <Pressable onPress={resend} disabled={secondsLeft > 0} hitSlop={8}>
            <Txt variant="caption" className={secondsLeft > 0 ? 'text-muted' : 'text-royal'}>
              {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
            </Txt>
          </Pressable>
        </View>

        <View className="mt-8">
          <Button
            label="Verify"
            tone="jade"
            size="lg"
            disabled={!complete}
            onPress={verifyPlaceholder}
          />
        </View>

        <Pressable onPress={() => router.replace('/(auth)/email')} className="mt-6 items-center" hitSlop={8}>
          <Txt variant="caption" className="text-royal">
            Use email instead
          </Txt>
        </Pressable>
      </View>
    </Screen>
  );
}
