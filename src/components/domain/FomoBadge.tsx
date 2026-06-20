/**
 * FomoBadge — a tiny "🔥 heating up" pill that flags momentum (a market/bet/drop
 * gaining steam). Pass a `heat` score (from the shared `heatScore` helper) or an
 * explicit `level`; the copy + tone escalate with it. Pure presentational.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

type Level = 'warm' | 'hot' | 'blazing';

interface Props {
  /** Raw heat score; mapped to a level if `level` isn't given. */
  heat?: number;
  level?: Level;
  /** Override the label. */
  label?: string;
}

function levelFor(heat: number): Level {
  if (heat >= 60) return 'blazing';
  if (heat >= 20) return 'hot';
  return 'warm';
}

const COPY: Record<Level, { emoji: string; text: string; color: string }> = {
  warm: { emoji: '🔥', text: 'heating up', color: colors.gold },
  hot: { emoji: '🔥', text: 'on fire', color: colors.coral },
  blazing: { emoji: '🌋', text: 'blazing', color: colors.coral },
};

export function FomoBadge({ heat = 0, level, label }: Props) {
  const lvl = level ?? levelFor(heat);
  const c = COPY[lvl];
  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-pill px-2 py-0.5"
      style={{ backgroundColor: `${c.color}1F` }}
    >
      <Txt variant="caption" style={{ color: c.color }} className="font-semibold">
        {c.emoji} {label ?? c.text}
      </Txt>
    </View>
  );
}
