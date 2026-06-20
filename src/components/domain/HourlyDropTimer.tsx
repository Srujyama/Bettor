/**
 * HourlyDropTimer — the FOMO centerpiece of the rewards hub. Shows a live
 * MM:SS countdown to the next hourly drop, a big CLAIM button when ready, the
 * reward the next claim would grant, and the streak flame count. Drives its own
 * 1s clock so the countdown ticks without the parent re-rendering. Reduce-motion
 * keeps the ready-state pulse static.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Txt, ChipCounter } from '@/components/ui';
import { colors } from '@/theme';
import { useHourlyDropStatus } from '@/features/engagement/hooks';
import type { EngagementState } from '@/shared';
import { NearMissPulse } from './NearMissPulse';

interface Props {
  engagement: Partial<EngagementState> | null | undefined;
  onClaim: () => void;
  claiming?: boolean;
}

function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function HourlyDropTimer({ engagement, onClaim, claiming }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = useHourlyDropStatus(engagement, now);
  const flames = '🔥'.repeat(Math.min(6, Math.max(0, status.streak)));

  return (
    <View className="rounded-card border border-jade/30 bg-surface p-5">
      <View className="flex-row items-center justify-between">
        <Txt variant="caption" muted className="uppercase tracking-widest">
          Hourly drop
        </Txt>
        {status.streak > 0 ? (
          <Txt variant="caption" style={{ color: colors.coral }}>
            {flames || '🔥'} {status.streak} in a row
          </Txt>
        ) : null}
      </View>

      <View className="mt-3 items-center gap-1">
        {status.ready ? (
          <NearMissPulse active>
            <Txt variant="display" style={{ color: colors.jade }}>
              READY
            </Txt>
          </NearMissPulse>
        ) : (
          <Txt variant="display" className="font-mono" style={{ color: colors.text }}>
            {fmt(status.readyIn)}
          </Txt>
        )}
        <View className="flex-row items-center gap-1">
          <Txt variant="caption" muted>
            Next claim
          </Txt>
          <ChipCounter value={status.nextAmount} size={16} color={colors.jade} prefix="+" />
        </View>
      </View>

      <View className="mt-4">
        <Button
          label={status.ready ? `Claim +${status.nextAmount}` : 'Heating up…'}
          tone="jade"
          size="lg"
          fullWidth
          disabled={!status.ready || !!claiming}
          loading={!!claiming}
          onPress={onClaim}
        />
      </View>
    </View>
  );
}
