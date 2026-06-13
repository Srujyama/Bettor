/**
 * ProBanner — the Pro tier hero. Shows the gold "Chipd Pro" headline, the PERKS
 * list, and either an active-status block (with expiry) or a subscribe CTA with
 * the Chip price. Pro is cosmetic/convenience only — never pay-to-win. Pure
 * presentation; onSubscribe is the caller's mutation.
 */
import { View } from 'react-native';
import { Card, Txt, Button, Pill } from '@/components/ui';
import { formatChips } from '@/shared/money';
import { PRO } from '@/shared/gamification';

interface Props {
  active: boolean;
  expiresAt?: number | null;
  canSubscribe?: boolean;
  pending?: boolean;
  onSubscribe?: () => void;
}

function daysLeft(expiresAt: number | null | undefined): number {
  if (expiresAt == null) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function ProBanner({
  active,
  expiresAt,
  canSubscribe = true,
  pending = false,
  onSubscribe,
}: Props) {
  const remaining = daysLeft(expiresAt);
  return (
    <Card raised className="gap-4 border-gold/40">
      <View className="flex-row items-center justify-between">
        <View className="gap-0.5">
          <Txt variant="caption" className="uppercase tracking-widest text-gold">
            Chipd
          </Txt>
          <Txt variant="title" className="text-gold">
            Pro
          </Txt>
        </View>
        {active ? (
          <Pill label={remaining > 0 ? `${remaining}d left` : 'Active'} tone="gold" />
        ) : null}
      </View>

      <View className="gap-2">
        {PRO.PERKS.map((perk) => (
          <View key={perk} className="flex-row items-start gap-2">
            <Txt variant="label" className="text-gold">
              ✦
            </Txt>
            <Txt variant="body" dim className="flex-1">
              {perk}
            </Txt>
          </View>
        ))}
      </View>

      {active ? (
        <View className="gap-1">
          <Button
            label={`Extend · ${formatChips(PRO.PRICE_CHIPS)} Chips`}
            tone="gold"
            onPress={onSubscribe}
            loading={pending}
            disabled={pending || !canSubscribe}
          />
          <Txt variant="caption" muted className="text-center">
            You're a Pro member. Renewing extends from your current expiry.
          </Txt>
        </View>
      ) : (
        <View className="gap-1">
          <Button
            label={`Go Pro · ${formatChips(PRO.PRICE_CHIPS)} Chips / ${PRO.PERIOD_DAYS}d`}
            tone="gold"
            onPress={onSubscribe}
            loading={pending}
            disabled={pending || !canSubscribe}
          />
          <Txt variant="caption" muted className="text-center">
            Paid with Chips only. Chips have no cash value.
          </Txt>
        </View>
      )}
    </Card>
  );
}
