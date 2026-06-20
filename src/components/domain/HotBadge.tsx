/**
 * HotBadge — a tiny "🔥 hot" pill whose intensity scales with a heat score. Used
 * on feed cards and the trending rail to signal momentum (drives FOMO without
 * implying any cash value). Presentational only.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';

interface Props {
  heat: number;
  /** Optional explicit label (e.g. "Trending"); defaults to a heat tier word. */
  label?: string;
}

function tier(heat: number): { word: string; flames: string } {
  if (heat >= 60) return { word: 'Blazing', flames: '🔥🔥🔥' };
  if (heat >= 25) return { word: 'Hot', flames: '🔥🔥' };
  if (heat >= 8) return { word: 'Warming', flames: '🔥' };
  return { word: 'New', flames: '✨' };
}

export function HotBadge({ heat, label }: Props) {
  const t = tier(heat);
  return (
    <View className="flex-row items-center gap-1 self-start rounded-pill border border-coral/30 bg-coral/15 px-2.5 py-1">
      <Txt variant="caption" className="text-coral font-semibold">
        {t.flames} {label ?? t.word}
      </Txt>
    </View>
  );
}
