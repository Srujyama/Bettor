/**
 * SeasonProgressBar — a horizontal time bar showing how far through the current
 * season we are, with the season name and time remaining. Presentational; takes
 * the season window (startsAt/endsAt) and a clock value.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  name: string;
  startsAt: number;
  endsAt: number;
  now?: number;
}

function timeLeft(ms: number): string {
  if (ms <= 0) return 'Ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export function SeasonProgressBar({ name, startsAt, endsAt, now = Date.now() }: Props) {
  const total = Math.max(1, endsAt - startsAt);
  const elapsed = Math.max(0, Math.min(total, now - startsAt));
  const pct = elapsed / total;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Txt variant="label" style={{ color: colors.gold, fontWeight: '800' }}>
          {name}
        </Txt>
        <Txt variant="caption" muted>
          {timeLeft(endsAt - now)}
        </Txt>
      </View>
      <View className="h-2.5 overflow-hidden rounded-pill bg-white/5">
        <View
          style={{
            width: `${pct * 100}%`,
            height: '100%',
            backgroundColor: colors.gold,
            borderRadius: 999,
          }}
        />
      </View>
    </View>
  );
}
