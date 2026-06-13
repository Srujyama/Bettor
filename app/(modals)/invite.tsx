/**
 * Invite modal — the virality / referral surface. Shows the user's referral
 * code, a chipd:// deep link, copy/share affordances, and WhatsApp-friendly
 * copy (all in ReferralBlock). The referral bonus is credited server-side when
 * an invitee signs up with the code (verifyAge). No money is computed here.
 */
import { ScrollView, Share, View } from 'react-native';
import { Stack } from 'expo-router';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { ReferralBlock } from '@/components/domain';
import { useCurrentUser } from '@/hooks/data';
import { ECONOMY } from '@/shared/constants';

export default function InviteModal() {
  const { data: me } = useCurrentUser();
  const code = me?.referralCode ?? null;

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Invite friends', presentation: 'modal' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 20 }}>
        <View className="gap-1">
          <Txt variant="title">Bring your crew</Txt>
          <Txt variant="body" dim>
            Chipd is better with friends to beat. Share your code — you both get a Chip bonus when
            they join.
          </Txt>
        </View>

        {code ? (
          <ReferralBlock referralCode={code} bonusChips={ECONOMY.REFERRAL_BONUS} />
        ) : (
          <Card className="items-center gap-3 py-8">
            <Txt variant="heading" className="text-center">
              Your invite code is on its way
            </Txt>
            <Txt variant="caption" muted className="text-center">
              Finish setting up your profile to unlock your referral code.
            </Txt>
            <Button
              label="Share Chipd anyway"
              tone="ghost"
              onPress={() =>
                Share.share({
                  message:
                    'Come bet me on Chipd 🎲 — friendly stakes, no real money. chipd://',
                })
              }
            />
          </Card>
        )}

        <Card className="gap-2">
          <Txt variant="label" dim className="uppercase tracking-wide">
            How it works
          </Txt>
          <Step n={1} text="Share your code or link with a friend." />
          <Step n={2} text="They tap the link or enter your code at sign-up." />
          <Step n={3} text={`You each earn ${ECONOMY.REFERRAL_BONUS.toLocaleString()} Chips once they verify.`} />
        </Card>

        <Txt variant="caption" muted className="px-1 text-center">
          Works great on WhatsApp, iMessage, or anywhere your friends already are.
        </Txt>
      </ScrollView>
    </Screen>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-7 w-7 items-center justify-center rounded-full bg-gold/15">
        <Txt variant="label" className="text-gold">
          {n}
        </Txt>
      </View>
      <Txt variant="body" className="flex-1">
        {text}
      </Txt>
    </View>
  );
}
