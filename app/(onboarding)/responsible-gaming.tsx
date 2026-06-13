/**
 * Responsible gaming consent. We explain — before any Chips are revealed — that
 * Chips are entertainment-only with no cash value, and that real safeguards
 * (limits, reality checks, self-exclusion) exist. The user must explicitly
 * acknowledge; we record rgConsented locally and route to the starter-Chips
 * reveal. The compliance disclosure is verbatim from the shared constant.
 */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, Txt, Button, Card } from '@/components/ui';
import { colors } from '@/theme';
import { useOnboarding } from '@/stores/ui';
import { NO_CASH_VALUE_DISCLOSURE, RG_DEFAULTS } from '@/shared/constants';

interface Point {
  emoji: string;
  title: string;
  body: string;
}

const POINTS: Point[] = [
  {
    emoji: '🎟️',
    title: 'Chips are just for fun',
    body: 'They have no real-world cash value. You can never buy them or cash them out.',
  },
  {
    emoji: '⏱️',
    title: 'Reality checks',
    body: `We'll gently remind you how long you've been playing every ${RG_DEFAULTS.sessionReminderMins} minutes.`,
  },
  {
    emoji: '🛡️',
    title: 'Limits & a pause button',
    body: 'Set daily stake limits, or take a break with self-exclusion any time from Settings.',
  },
];

export default function ResponsibleGaming() {
  const setRgConsented = useOnboarding((s) => s.setRgConsented);
  const [acknowledged, setAcknowledged] = useState(false);

  const onContinue = () => {
    if (!acknowledged) return;
    setRgConsented(true);
    router.push('/(onboarding)/starter-chips');
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-10 gap-2">
          <Txt style={{ fontSize: 48 }}>🤝</Txt>
          <Txt variant="title" className="mt-3">
            Play it responsibly
          </Txt>
          <Txt variant="body" dim>
            Chipd is built to be a good time, not a habit. Here's how we keep it that way.
          </Txt>
        </View>

        <View className="mt-8 gap-3">
          {POINTS.map((p) => (
            <Card key={p.title} raised className="flex-row gap-3">
              <Txt style={{ fontSize: 28 }}>{p.emoji}</Txt>
              <View className="flex-1">
                <Txt variant="heading">{p.title}</Txt>
                <Txt variant="caption" dim className="mt-1 leading-5">
                  {p.body}
                </Txt>
              </View>
            </Card>
          ))}
        </View>

        <View className="mt-6 rounded-chip border border-gold/30 bg-gold/10 p-4">
          <Txt variant="label" className="text-gold">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </View>

        <View className="flex-1" />

        {/* Explicit acknowledgement */}
        <Pressable
          onPress={() => setAcknowledged((a) => !a)}
          className="mt-8 flex-row items-center gap-3"
          hitSlop={8}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: acknowledged ? colors.jade : colors.muted,
              backgroundColor: acknowledged ? colors.jade : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {acknowledged ? (
              <Txt style={{ color: colors.ink, fontWeight: '800', fontSize: 15 }}>✓</Txt>
            ) : null}
          </View>
          <Txt variant="body" className="flex-1">
            I understand Chips have no cash value and I'm playing for entertainment.
          </Txt>
        </Pressable>

        <View className="mt-6">
          <Button
            label="I understand"
            tone="jade"
            size="lg"
            disabled={!acknowledged}
            onPress={onContinue}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
