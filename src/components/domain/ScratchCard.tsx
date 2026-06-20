/**
 * ScratchCard — a 3x3 grid of cells the player "scratches" to reveal the SERVER
 * values. Tapping a cell fades its foil mask away (Reanimated opacity). The cells
 * shown come entirely from the server result; the component only handles the
 * reveal interaction + a small reveal pulse. A win is 3 matching non-zero values
 * (the server already computed the multiplier — we just highlight the trio).
 *
 * Reduce-motion: cells reveal instantly with no scale pulse.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

/** Map a prize-pool value to a glyph (0 = blank). */
function glyph(v: number): string {
  if (v <= 0) return '✖️';
  if (v >= 25) return '💎';
  if (v >= 10) return '7️⃣';
  if (v >= 5) return '⭐';
  if (v >= 3) return '🔔';
  if (v >= 2) return '🍀';
  return '🍒';
}

interface Props {
  /** Server-revealed 9 cell values; null until a round resolves. */
  cells: number[] | null;
  /** The winning multiplier (>0 if a 3-match) — used to highlight the trio. */
  multiplier: number;
  /** True while a round is in flight (card locked, not yet revealable). */
  busy?: boolean;
  /** Fires when every cell has been scratched (so the screen can show the result). */
  onAllRevealed?: () => void;
}

export function ScratchCard({ cells, multiplier, busy, onAllRevealed }: Props) {
  const [revealed, setRevealed] = useState<boolean[]>(Array(9).fill(false));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Reset the foil whenever a fresh set of cells arrives.
  useEffect(() => {
    setRevealed(Array(9).fill(false));
  }, [cells]);

  // The value that forms the winning trio (for highlight), if any.
  const winningValue = useMemo(() => {
    if (!cells || multiplier <= 0) return null;
    const counts = new Map<number, number>();
    for (const v of cells) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: number | null = null;
    for (const [v, c] of counts) if (v > 0 && c >= 3) best = v === multiplier ? v : (best ?? v);
    return multiplier > 0 ? multiplier : best;
  }, [cells, multiplier]);

  const scratch = (i: number) => {
    if (busy || !cells || revealed[i]) return;
    const next = [...revealed];
    next[i] = true;
    setRevealed(next);
    if (next.every(Boolean)) onAllRevealed?.();
  };

  const revealAll = () => {
    if (busy || !cells) return;
    const all = Array(9).fill(true);
    setRevealed(all);
    onAllRevealed?.();
  };

  return (
    <View className="items-center gap-3">
      <View className="rounded-card border border-hairline bg-surface p-3" style={{ width: 264 }}>
        <View className="flex-row flex-wrap gap-2" style={{ width: 240 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <Cell
              key={i}
              value={cells ? cells[i] : null}
              revealed={revealed[i]}
              isWinner={winningValue != null && cells?.[i] === winningValue}
              reduceMotion={reduceMotion}
              onPress={() => scratch(i)}
            />
          ))}
        </View>
      </View>
      {cells && !revealed.every(Boolean) ? (
        <Pressable onPress={revealAll}>
          <Txt variant="caption" muted className="underline">
            Reveal all
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

function Cell({
  value,
  revealed,
  isWinner,
  reduceMotion,
  onPress,
}: {
  value: number | null;
  revealed: boolean;
  isWinner: boolean;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const foil = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (revealed) {
      foil.value = reduceMotion ? 0 : withTiming(0, { duration: 260 });
      if (!reduceMotion) scale.value = withSpring(1.06, { damping: 6 }, () => {
        scale.value = withSpring(1, { damping: 10 });
      });
    } else {
      foil.value = 1;
      scale.value = 1;
    }
  }, [revealed, reduceMotion, foil, scale]);

  const foilStyle = useAnimatedStyle(() => ({ opacity: foil.value }));
  const cellStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={cellStyle}
        className={`items-center justify-center rounded-chip border ${
          isWinner && revealed ? 'border-gold/60 bg-gold/15' : 'border-hairline bg-ink'
        }`}
      >
        <View style={{ width: 74, height: 74, alignItems: 'center', justifyContent: 'center' }}>
          {revealed && value != null ? (
            <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(180)}>
              <Txt style={{ fontSize: 34 }}>{glyph(value)}</Txt>
            </Animated.View>
          ) : null}
          {/* Foil mask */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                backgroundColor: colors.surfaceRaised,
              },
              foilStyle,
            ]}
          >
            <Txt style={{ fontSize: 22, color: colors.gold }}>?</Txt>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}
