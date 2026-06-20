/**
 * RewardChest — the compact entry card for the chest on the rewards hub. Shows
 * the chest, whether a FREE one is ready (or the Chip cost to open now), and a
 * CTA. The actual open animation/reveal lives in <ChestOpen/>; this is the
 * resting tile that gates the action and surfaces the cooldown.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Txt, Pill } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  /** Epoch ms the next FREE chest becomes available (null = ready / unknown). */
  nextFreeAt?: number | null;
  /** Chip cost to open one now while the free one is on cooldown. */
  paidCost?: number;
  chestsOpened?: number;
  opening?: boolean;
  onOpen: () => void;
}

function fmtRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  const s = total % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function RewardChest({ nextFreeAt, paidCost = 75, chestsOpened, opening, onOpen }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const freeReady = nextFreeAt == null || nextFreeAt <= now;
  const remaining = freeReady ? 0 : (nextFreeAt as number) - now;

  return (
    <View className="rounded-card border border-gold/30 bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <Txt style={{ fontSize: 40 }}>🧰</Txt>
          <View>
            <Txt variant="heading">Mystery chest</Txt>
            <Txt variant="caption" muted>
              {chestsOpened != null ? `${chestsOpened} opened` : 'Variable reward'}
            </Txt>
          </View>
        </View>
        {freeReady ? (
          <Pill label="FREE" tone="gold" />
        ) : (
          <Pill label={fmtRemaining(remaining)} tone="muted" />
        )}
      </View>

      <View className="mt-4">
        <Button
          label={freeReady ? 'Open free chest' : `Open now · 💎 ${paidCost}`}
          tone="gold"
          size="lg"
          fullWidth
          loading={!!opening}
          disabled={!!opening}
          onPress={onOpen}
        />
      </View>

      <Txt variant="caption" muted className="mt-2 text-center">
        Chips have no real-world cash value.
      </Txt>
    </View>
  );
}
