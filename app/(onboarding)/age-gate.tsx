/**
 * Age gate. We collect a real date of birth with three inputs (no datetimepicker
 * dependency is installed). Age is computed client-side purely for instant UX —
 * the SERVER is the source of truth: we submit the DOB epoch to fns.verifyAge,
 * which records ageVerified and grants signup Chips. Under-18 is blocked locally
 * with a clear message and never sent on.
 */
import { forwardRef, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Screen, Txt, Button } from '@/components/ui';
import { colors } from '@/theme';
import { fns } from '@/lib/firebase';
import { useOnboarding } from '@/stores/ui';
import { PILOT_REGION, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const MIN_AGE = 18;
const MAX_AGE = 120;

/** Days in a given month (1-12), accounting for leap years. */
function daysInMonth(month: number, year: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Exact whole-years age at `now` for a DOB; -1 if the date is invalid. */
function computeAge(d: number, m: number, y: number, now = Date.now()): number {
  if (!d || !m || !y) return -1;
  if (m < 1 || m > 12) return -1;
  if (d < 1 || d > daysInMonth(m, y)) return -1;
  const today = new Date(now);
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export default function AgeGate() {
  const setAgeAcknowledged = useOnboarding((s) => s.setAgeAcknowledged);
  const setTutorialDone = useOnboarding((s) => s.setTutorialDone);
  const setDevBypass = useOnboarding((s) => s.setDevBypass);

  // DEV-ONLY escape hatch — see the button at the bottom of this screen.
  // TODO(chipd): remove once age verification works reliably end-to-end.
  const devSkip = () => {
    setAgeAcknowledged(true);
    setTutorialDone(true);
    setDevBypass(true);
    toast({
      title: 'Dev skip — onboarding bypassed',
      message: 'Backend age verification was skipped. This must not ship.',
      preset: 'none',
    });
    router.replace('/(tabs)');
  };

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // Inputs are ordered Month → Day → Year; refs advance focus along that order.
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const dNum = parseInt(day, 10) || 0;
  const mNum = parseInt(month, 10) || 0;
  const yNum = parseInt(year, 10) || 0;

  const age = useMemo(() => computeAge(dNum, mNum, yNum), [dNum, mNum, yNum]);
  const complete = day.length > 0 && month.length > 0 && year.length === 4;
  const dateValid = age >= 0 && age <= MAX_AGE;
  const tooYoung = complete && dateValid && age < MIN_AGE;

  const dobMillis = useMemo(() => {
    if (!dateValid || !complete) return null;
    // UTC midnight of the DOB; the server re-validates anyway.
    return Date.UTC(yNum, mNum - 1, dNum);
  }, [dateValid, complete, yNum, mNum, dNum]);

  const verify = useMutation({
    mutationFn: async () => {
      if (dobMillis == null) throw new Error('Enter a valid date of birth.');
      return fns.verifyAge({ dateOfBirth: dobMillis, region: PILOT_REGION });
    },
    onSuccess: () => {
      setAgeAcknowledged(true);
      toast({ title: "You're verified", preset: 'done', haptic: 'success' });
      router.replace('/(onboarding)/profile');
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : 'Could not verify your age. Please try again.';
      toast({ title: 'Verification failed', message: msg, preset: 'error', haptic: 'error' });
    },
  });

  return (
    <Screen edges={['top', 'bottom']}>
      <View className="flex-1 px-6">
        <View className="mt-12 gap-2">
          <Txt style={{ fontSize: 56 }}>🔞</Txt>
          <Txt variant="title" className="mt-4">
            How old are you?
          </Txt>
          <Txt variant="body" dim>
            Chipd is strictly for adults. We confirm your age once — it's required to play.
          </Txt>
        </View>

        <View className="mt-10 gap-2">
          <Txt variant="label" dim>
            Date of birth
          </Txt>
          <View className="flex-row gap-3">
            <DobBox
              placeholder="MM"
              value={month}
              maxLength={2}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9]/g, '');
                setMonth(clean);
                if (clean.length === 2) dayRef.current?.focus();
              }}
            />
            <DobBox
              ref={dayRef}
              placeholder="DD"
              value={day}
              maxLength={2}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9]/g, '');
                setDay(clean);
                if (clean.length === 2) yearRef.current?.focus();
              }}
            />
            <DobBox
              ref={yearRef}
              placeholder="YYYY"
              value={year}
              maxLength={4}
              flex={1.4}
              onChangeText={(v) => setYear(v.replace(/[^0-9]/g, ''))}
            />
          </View>

          {complete && !dateValid ? (
            <Txt variant="caption" className="mt-1 text-coral">
              That date doesn't look right. Use DD / MM / YYYY.
            </Txt>
          ) : null}
          {tooYoung ? (
            <View className="mt-3 rounded-chip border border-coral/30 bg-coral/10 p-4">
              <Txt variant="label" className="text-coral">
                You must be 18 or older to use Chipd.
              </Txt>
              <Txt variant="caption" dim className="mt-1">
                If you entered the wrong date, correct it above.
              </Txt>
            </View>
          ) : null}
          {complete && dateValid && !tooYoung ? (
            <Txt variant="caption" muted className="mt-1">
              You're {age}. Tap continue to confirm.
            </Txt>
          ) : null}
        </View>

        <View className="flex-1" />

        <Button
          label="Continue"
          tone="jade"
          size="lg"
          loading={verify.isPending}
          disabled={!complete || !dateValid || tooYoung}
          onPress={() => verify.mutate()}
        />

        <Txt variant="caption" muted className="mt-6 text-center">
          Your age is verified on our server and stored securely.
          {'\n'}
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>

        {/* DEV-ONLY skip — stripped from production builds via __DEV__. Lets you
            into the app for UI testing when the backend is unreachable.
            TODO(chipd): remove once age verification is reliable end-to-end. */}
        {__DEV__ ? (
          <View className="mb-2 mt-4 items-center">
            <Button
              label="⚠︎ Skip onboarding (dev only)"
              tone="ghost"
              size="sm"
              fullWidth={false}
              haptic={false}
              onPress={devSkip}
            />
            <Txt variant="caption" muted className="mt-1 text-center">
              Dev build only · bypasses real age verification · not in production
            </Txt>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

interface DobBoxProps {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  maxLength: number;
  flex?: number;
}

/** A single segment of the date-of-birth entry; forwards its ref so the day/month
 * boxes can advance focus to the next segment. */
const DobBox = forwardRef<TextInput, DobBoxProps>(function DobBox(
  { placeholder, value, onChangeText, maxLength, flex = 1 },
  ref,
) {
  return (
    <View style={{ flex }}>
      <View className="rounded-chip border border-hairline bg-surface-raised px-4">
        <TextInput
          ref={ref}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          className="py-3.5 text-center font-sans text-lg text-text"
        />
      </View>
    </View>
  );
});
