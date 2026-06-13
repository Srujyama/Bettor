/**
 * Wallet — the player's Chip balance home. Big ChipCounter balance, chipsHeld
 * shown as "in play", the prominent Daily Chips claim (with streak + cooldown),
 * a zero-refill path when broke, a recent ledger preview, and the persistent
 * no-cash-value disclosure. All money is read-only here; mutations go through
 * the wallet feature hooks which call Cloud Functions.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, Card, ChipCounter, Pill, Screen, Txt } from '@/components/ui';
import { colors } from '@/theme';
import { useLedger, useWallet } from '@/hooks/data';
import { useGrantDaily, useClaimZeroRefill } from '@/features/social/hooks';
import { formatChips } from '@/shared/money';
import { ECONOMY, LEDGER_DIRECTION, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';
import { ledgerLabel, relativeTime } from '@/lib/format';
import type { LedgerEntry } from '@/shared/schemas';

const MACAU_DAY_MS = 24 * 60 * 60 * 1000;

function cooldownLabel(targetAt: number, now: number): string | null {
  const ms = targetAt - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

export default function WalletScreen() {
  const router = useRouter();
  const { data: user } = useWallet();
  const { data: ledger } = useLedger(5);
  const grantDaily = useGrantDaily();
  const claimRefill = useClaimZeroRefill();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const balance = user?.chipsBalance ?? 0;
  const held = user?.chipsHeld ?? 0;
  const streak = user?.dailyStreak ?? 0;

  // The server is authoritative for eligibility; derive a best-effort gate for the UI.
  const lastDaily = user?.lastDailyGrantAt ?? null;
  const dailyClaimedToday = lastDaily != null && now - lastDaily < MACAU_DAY_MS;
  const dailyCooldown =
    dailyClaimedToday && lastDaily != null ? cooldownLabel(lastDaily + MACAU_DAY_MS, now) : null;

  const lastRefill = user?.lastZeroRefillAt ?? null;
  const refillReady = lastRefill == null || now - lastRefill >= ECONOMY.ZERO_REFILL_COOLDOWN_MS;
  const refillCooldown =
    lastRefill != null && !refillReady
      ? cooldownLabel(lastRefill + ECONOMY.ZERO_REFILL_COOLDOWN_MS, now)
      : null;
  const showRefill = balance === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Wallet' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}>
        {/* Hero balance */}
        <Card raised className="items-center gap-2 py-8">
          <Txt variant="caption" muted className="uppercase tracking-widest">
            Your balance
          </Txt>
          <ChipCounter value={balance} size={56} color={colors.gold} />
          <View className="mt-1 flex-row items-center gap-2">
            <Pill label={`🔒 ${formatChips(held)} in play`} tone={held > 0 ? 'royal' : 'muted'} />
          </View>
        </Card>

        {/* Daily Chips claim */}
        <Card className="gap-3">
          <View className="flex-row items-center justify-between">
            <View className="gap-0.5">
              <Txt variant="heading">Daily Chips</Txt>
              <Txt variant="caption" dim>
                {streak > 0 ? `🔥 ${streak}-day streak` : 'Check in every day for free Chips'}
              </Txt>
            </View>
            <Txt variant="heading" style={{ color: colors.jade }}>
              +{formatChips(ECONOMY.DAILY_GRANT)}
            </Txt>
          </View>
          <Button
            label={
              dailyClaimedToday
                ? `Claimed${dailyCooldown ? ` · back in ${dailyCooldown}` : ''}`
                : 'Claim daily Chips'
            }
            tone="gold"
            onPress={() => grantDaily.mutate()}
            loading={grantDaily.isPending}
            disabled={dailyClaimedToday || grantDaily.isPending}
          />
        </Card>

        {/* Zero refill — only when broke */}
        {showRefill ? (
          <Card className="gap-3 border-coral/30">
            <View className="gap-0.5">
              <Txt variant="heading">Out of Chips?</Txt>
              <Txt variant="caption" dim>
                Claim a free {formatChips(ECONOMY.ZERO_REFILL_AMOUNT)} Chip refill
                {refillReady ? '' : refillCooldown ? ` (available in ${refillCooldown})` : ''}.
              </Txt>
            </View>
            <Button
              label={
                refillReady ? `Claim ${formatChips(ECONOMY.ZERO_REFILL_AMOUNT)} Chips` : 'On cooldown'
              }
              tone="coral"
              onPress={() => claimRefill.mutate()}
              loading={claimRefill.isPending}
              disabled={!refillReady || claimRefill.isPending}
            />
          </Card>
        ) : null}

        {/* Recent ledger preview */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Txt variant="label" dim className="uppercase tracking-wide">
              Recent activity
            </Txt>
            <Button
              label="See all"
              tone="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => router.push('/wallet/transactions')}
            />
          </View>
          <Card className="gap-1 p-2">
            {(ledger ?? []).length === 0 ? (
              <View className="items-center py-6">
                <Txt variant="caption" muted>
                  No transactions yet.
                </Txt>
              </View>
            ) : (
              (ledger ?? []).map((entry, i) => (
                <LedgerPreviewRow key={entry.entryId} entry={entry} divider={i > 0} />
              ))
            )}
          </Card>
        </View>

        {/* Compliance disclosure — persistent */}
        <Txt variant="caption" muted className="px-1">
          {NO_CASH_VALUE_DISCLOSURE}
        </Txt>
      </ScrollView>
    </Screen>
  );
}

function LedgerPreviewRow({ entry, divider }: { entry: LedgerEntry; divider: boolean }) {
  const credit = entry.direction === LEDGER_DIRECTION.CREDIT;
  const color = credit ? colors.jade : colors.coral;
  return (
    <View
      className={`flex-row items-center justify-between px-2 py-2.5 ${divider ? 'border-t border-hairline' : ''}`}
    >
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {ledgerLabel(entry.reason)}
        </Txt>
        <Txt variant="caption" muted>
          {relativeTime(entry.createdAt)}
        </Txt>
      </View>
      <Txt variant="label" style={{ color }}>
        {credit ? '+' : '−'}
        {formatChips(entry.amount)}
      </Txt>
    </View>
  );
}
