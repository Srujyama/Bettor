/**
 * Responsible gaming — the player's safety controls and activity dashboard.
 *  • Limits: daily / weekly stake caps, daily bet-count cap, session reminder
 *    cadence, and a self-exclusion period — all persisted via fns.setRgLimits
 *    (useSetRgLimits). null/empty means "no limit".
 *  • My Activity: chips wagered / won / lost / net derived from the ledger
 *    (useLedger), so the dashboard works with whatever history exists.
 * This screen is reachable at any time and never blocks itself.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Card, Input, Pill, Screen, Txt } from '@/components/ui';
import { StatBadge } from '@/components/domain';
import { colors } from '@/theme';
import { useCurrentUser, useLedger } from '@/hooks/data';
import { useSetRgLimits } from '@/features/social/hooks';
import { formatChips } from '@/shared/money';
import { LEDGER_DIRECTION, LEDGER_REASON, NO_CASH_VALUE_DISCLOSURE } from '@/shared/constants';

const REMINDER_OPTIONS = [15, 30, 45, 60] as const;
const EXCLUSION_OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'None', ms: null },
  { label: '24 hours', ms: 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '1 month', ms: 30 * 24 * 60 * 60 * 1000 },
];

/** Parse a limit field: empty → null (no limit); else a non-negative integer. */
function parseLimit(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Math.floor(Number(t));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ResponsibleGamingSettings() {
  const { data: user } = useCurrentUser();
  const { data: ledger } = useLedger(200);
  const setRgLimits = useSetRgLimits();

  const limits = user?.rgLimits;

  const [daily, setDaily] = useState('');
  const [weekly, setWeekly] = useState('');
  const [betCount, setBetCount] = useState('');
  const [reminder, setReminder] = useState<number>(45);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the form once from the user's saved limits.
  useEffect(() => {
    if (!limits || hydrated) return;
    setDaily(limits.dailyStakeLimit != null ? String(limits.dailyStakeLimit) : '');
    setWeekly(limits.weeklyStakeLimit != null ? String(limits.weeklyStakeLimit) : '');
    setBetCount(limits.dailyBetCountLimit != null ? String(limits.dailyBetCountLimit) : '');
    setReminder(limits.sessionReminderMins ?? 45);
    setHydrated(true);
  }, [limits, hydrated]);

  const now = Date.now();
  const excludedUntil = limits?.selfExclusionUntil ?? null;
  const isExcluded = excludedUntil != null && excludedUntil > now;

  const saveLimits = () => {
    setRgLimits.mutate({
      dailyStakeLimit: parseLimit(daily),
      weeklyStakeLimit: parseLimit(weekly),
      dailyBetCountLimit: parseLimit(betCount),
      sessionReminderMins: reminder,
    });
  };

  const setExclusion = (ms: number | null) => {
    setRgLimits.mutate({ selfExcludeForMs: ms });
  };

  // ── Activity dashboard from the ledger ──
  const activity = useMemo(() => {
    let wagered = 0;
    let won = 0;
    for (const e of ledger ?? []) {
      if (e.direction === LEDGER_DIRECTION.DEBIT && e.reason === LEDGER_REASON.STAKE_ESCROW) {
        wagered += e.amount;
      }
      if (e.direction === LEDGER_DIRECTION.CREDIT && e.reason === LEDGER_REASON.PAYOUT) {
        won += e.amount;
      }
    }
    const net = won - wagered;
    const lost = net < 0 ? -net : 0;
    return { wagered, won, lost, net };
  }, [ledger]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* Self-exclusion banner */}
        {isExcluded ? (
          <Card className="gap-1 border-coral/40">
            <Txt variant="heading" style={{ color: colors.coral }}>
              You're on a break
            </Txt>
            <Txt variant="caption" dim>
              Betting is paused until {new Date(excludedUntil!).toLocaleString()}.
            </Txt>
          </Card>
        ) : null}

        {/* My Activity */}
        <View className="gap-2">
          <Txt variant="label" dim className="px-1 uppercase tracking-wide">
            My activity
          </Txt>
          <View className="flex-row gap-2">
            <StatBadge label="Wagered" value={formatChips(activity.wagered)} tone="royal" />
            <StatBadge label="Won" value={formatChips(activity.won)} tone="jade" />
          </View>
          <View className="flex-row gap-2">
            <StatBadge label="Lost" value={formatChips(activity.lost)} tone="coral" />
            <StatBadge
              label="Net"
              value={`${activity.net >= 0 ? '+' : '−'}${formatChips(Math.abs(activity.net))}`}
              tone={activity.net >= 0 ? 'jade' : 'coral'}
            />
          </View>
          <Txt variant="caption" muted className="px-1">
            Based on your last {(ledger ?? []).length} transactions.
          </Txt>
        </View>

        {/* Limits */}
        <View className="gap-2">
          <Txt variant="label" dim className="px-1 uppercase tracking-wide">
            Limits
          </Txt>
          <Card className="gap-3">
            <Input
              label="Daily stake limit (Chips)"
              placeholder="No limit"
              keyboardType="number-pad"
              value={daily}
              onChangeText={setDaily}
            />
            <Input
              label="Weekly stake limit (Chips)"
              placeholder="No limit"
              keyboardType="number-pad"
              value={weekly}
              onChangeText={setWeekly}
            />
            <Input
              label="Daily bet count limit"
              placeholder="No limit"
              keyboardType="number-pad"
              value={betCount}
              onChangeText={setBetCount}
            />

            <View className="gap-2">
              <Txt variant="label" dim>
                Session reminder
              </Txt>
              <View className="flex-row flex-wrap gap-2">
                {REMINDER_OPTIONS.map((m) => (
                  <SelectChip
                    key={m}
                    label={`${m} min`}
                    active={reminder === m}
                    onPress={() => setReminder(m)}
                  />
                ))}
              </View>
            </View>

            <Button
              label="Save limits"
              tone="jade"
              loading={setRgLimits.isPending}
              disabled={!user}
              onPress={saveLimits}
            />
          </Card>
        </View>

        {/* Self-exclusion */}
        <View className="gap-2">
          <Txt variant="label" dim className="px-1 uppercase tracking-wide">
            Take a break
          </Txt>
          <Card className="gap-3">
            <Txt variant="caption" dim>
              Pause betting for a fixed period. You can still browse and manage your account.
            </Txt>
            <View className="gap-2">
              {EXCLUSION_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  label={opt.ms == null ? 'Clear break' : opt.label}
                  tone={opt.ms == null ? 'ghost' : 'coral'}
                  loading={setRgLimits.isPending}
                  onPress={() => setExclusion(opt.ms)}
                />
              ))}
            </View>
          </Card>
        </View>

        <View className="flex-row items-center gap-2 px-1">
          <Pill label="18+" tone="muted" />
          <Txt variant="caption" muted className="flex-1">
            {NO_CASH_VALUE_DISCLOSURE}
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

function SelectChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Button
      label={label}
      tone={active ? 'royal' : 'ghost'}
      size="sm"
      fullWidth={false}
      onPress={onPress}
    />
  );
}
