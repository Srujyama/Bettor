/**
 * Phone entry. The full UI is built (country dialing code + national number,
 * Macau +853 default for the pilot), but phone auth via the Firebase JS SDK on
 * React Native needs a reCAPTCHA verifier flow that isn't provisioned in this
 * Expo-Go setup. So we route to the OTP screen which, on "verify", explains the
 * email-first fallback and sends the user to the email path. When native phone
 * auth lands (react-native-firebase / a configured verifier), this screen calls
 * the real send-code service and the OTP screen confirms it — no UI rework.
 */
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Txt, Button, Input } from '@/components/ui';
import { NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

/** Small set of dialing codes relevant to the Macau expat pilot. */
const DIAL_CODES = [
  { code: '+853', label: '🇲🇴 Macau' },
  { code: '+852', label: '🇭🇰 Hong Kong' },
  { code: '+86', label: '🇨🇳 China' },
  { code: '+44', label: '🇬🇧 UK' },
  { code: '+1', label: '🇺🇸 US' },
  { code: '+61', label: '🇦🇺 Australia' },
  { code: '+351', label: '🇵🇹 Portugal' },
] as const;

export default function PhoneEntry() {
  const [dial, setDial] = useState<string>('+853');
  const [national, setNational] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const digits = national.replace(/[^0-9]/g, '');
  const valid = digits.length >= 5 && digits.length <= 15;
  const e164 = `${dial}${digits}`;

  const onContinue = () => {
    if (!valid) return;
    router.push({ pathname: '/(auth)/otp', params: { phone: e164 } });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-row items-center pt-4">
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Txt variant="heading" muted>
                ‹ Back
              </Txt>
            </Pressable>
          </View>

          <View className="mt-10 gap-2">
            <Txt variant="title">What's your number?</Txt>
            <Txt variant="body" dim>
              We'll text you a 6-digit code to confirm it's you.
            </Txt>
          </View>

          <View className="mt-8 gap-2">
            <Txt variant="label" dim>
              Phone number
            </Txt>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setPickerOpen((o) => !o)}
                className="flex-row items-center justify-center rounded-chip border border-hairline bg-surface-raised px-4"
              >
                <Txt variant="body">{dial}</Txt>
                <Txt variant="body" muted className="ml-1">
                  ▾
                </Txt>
              </Pressable>
              <View className="flex-1">
                <Input
                  placeholder="6XXX XXXX"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  value={national}
                  onChangeText={setNational}
                  returnKeyType="go"
                  onSubmitEditing={onContinue}
                />
              </View>
            </View>

            {pickerOpen ? (
              <View className="mt-1 overflow-hidden rounded-chip border border-hairline bg-surface">
                {DIAL_CODES.map((c) => (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      setDial(c.code);
                      setPickerOpen(false);
                    }}
                    className={`flex-row items-center justify-between px-4 py-3 ${
                      c.code === dial ? 'bg-surface-raised' : ''
                    }`}
                  >
                    <Txt variant="body">{c.label}</Txt>
                    <Txt variant="body" muted>
                      {c.code}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View className="mt-8">
            <Button label="Send code" tone="jade" size="lg" disabled={!valid} onPress={onContinue} />
          </View>

          <Pressable onPress={() => router.replace('/(auth)/email')} className="mt-6 items-center" hitSlop={8}>
            <Txt variant="caption" className="text-royal">
              Use email instead
            </Txt>
          </Pressable>

          <View className="flex-1" />

          <Txt variant="caption" muted className="mt-8 text-center">
            18+ only. {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
