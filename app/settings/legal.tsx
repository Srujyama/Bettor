/**
 * Legal — plain-language summaries of the Terms and Privacy policy, the mandatory
 * compliance statements (no cash value, 18+), and the Macau responsible-gambling
 * helpline note. Static content; no mutations.
 */
import { ScrollView, View } from 'react-native';
import { Card, Pill, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { NO_CASH_VALUE_DISCLOSURE, PILOT_REGION } from '@/shared/constants';

export default function LegalSettings() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* Compliance statements */}
        <Card className="gap-3 border-gold/30">
          <View className="flex-row items-center gap-2">
            <Pill label="18+" tone="gold" />
            <Pill label={`Pilot · ${PILOT_REGION}`} tone="muted" />
          </View>
          <Txt variant="heading">{NO_CASH_VALUE_DISCLOSURE}</Txt>
          <Txt variant="body" dim>
            Chipd is for entertainment only. Chips cannot be bought, sold, redeemed or exchanged for
            money or anything of value. You must be 18 or older to use Chipd. Age is verified at
            sign-up.
          </Txt>
        </Card>

        {/* Terms summary */}
        <Section title="Terms of Service">
          By using Chipd you agree to play fairly, not to manipulate outcomes or abuse the Chip
          economy, and to use the app only where permitted. Chips are a licensed-use, closed-loop
          entertainment token with no monetary value. We may adjust the Chip economy, suspend
          accounts for abuse, and resolve disputes through our trust and safety process. The full
          Terms are available at chipd.app/terms.
        </Section>

        {/* Privacy summary */}
        <Section title="Privacy">
          We collect the minimum needed to run the game: your profile, friends, bets and device for
          notifications. We never sell your data. Money-like balances are virtual Chips only. You can
          request an export or deletion from Privacy settings. The full policy is at
          chipd.app/privacy.
        </Section>

        {/* Macau responsible gambling helpline */}
        <Card className="gap-2 border-coral/30">
          <Txt variant="heading">Need support?</Txt>
          <Txt variant="body" dim>
            If gambling stops being fun, take a break from Responsible Gaming settings. For
            confidential help in Macau, contact the Responsible Gambling Counselling line.
          </Txt>
          <Txt variant="label" style={{ color: colors.jade }}>
            Macau helpline: 2823 0101
          </Txt>
          <Txt variant="caption" muted>
            Social Welfare Bureau (IAS) responsible-gambling services, Macau SAR.
          </Txt>
        </Card>

        <Txt variant="caption" muted className="text-center" style={{ color: colors.textFaint }}>
          © {new Date().getFullYear()} Chipd. All rights reserved.
        </Txt>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <Card className="gap-2">
      <Txt variant="heading">{title}</Txt>
      <Txt variant="body" dim>
        {children}
      </Txt>
    </Card>
  );
}
