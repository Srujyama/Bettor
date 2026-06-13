/**
 * ReferralBlock — shows the user's referral code + a deep link, with copy and
 * share affordances and WhatsApp-friendly copy. The referral bonus is credited
 * server-side when an invitee signs up with the code (verifyAge); this component
 * only presents the code and shares it. Presentational + clipboard/share only.
 */
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { toast } from 'burnt';
import { Button, Card, Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  referralCode: string;
  /** Chips the referrer earns per join (for the share copy). */
  bonusChips?: number;
}

/** Build the chipd:// deep link an invitee can tap to prefill the code. */
export function referralLink(code: string): string {
  return `chipd://invite/${code}`;
}

/** WhatsApp / SMS-friendly invite message. */
export function referralMessage(code: string, bonusChips?: number): string {
  const bonus = bonusChips ? ` We both score ${bonusChips.toLocaleString()} Chips when you join.` : '';
  return `Come bet me on Chipd 🎲 — friendly stakes, no real money.${bonus} Use my code ${code} or tap ${referralLink(code)}`;
}

export function ReferralBlock({ referralCode, bonusChips }: Props) {
  const copyCode = async () => {
    await Clipboard.setStringAsync(referralCode);
    toast({ title: 'Code copied', preset: 'done', haptic: 'success' });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(referralLink(referralCode));
    toast({ title: 'Link copied', preset: 'done', haptic: 'success' });
  };

  const onShare = async () => {
    try {
      await Share.share({ message: referralMessage(referralCode, bonusChips) });
    } catch {
      await copyLink();
    }
  };

  return (
    <View className="gap-3">
      <Card raised className="items-center gap-2 py-6">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Your invite code
        </Txt>
        <Txt variant="display" style={{ color: colors.gold, letterSpacing: 4 }}>
          {referralCode}
        </Txt>
        {bonusChips ? (
          <Txt variant="caption" muted className="text-center">
            You and your friend each earn {bonusChips.toLocaleString()} Chips when they join.
          </Txt>
        ) : null}
      </Card>

      <Button label="Share invite" tone="gold" onPress={onShare} />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label="Copy code" tone="ghost" onPress={copyCode} />
        </View>
        <View className="flex-1">
          <Button label="Copy link" tone="ghost" onPress={copyLink} />
        </View>
      </View>
      <Txt variant="caption" muted className="px-1 text-center">
        Chips are for entertainment only and have no real-world cash value.
      </Txt>
    </View>
  );
}
