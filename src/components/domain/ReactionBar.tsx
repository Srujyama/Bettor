/**
 * ReactionBar — a compact row of emoji reactions for a bet-detail comment (or
 * any reactable surface). Tapping an emoji fires onReact(emoji) and triggers a
 * playful "fly-up" animation: the chosen glyph floats up, drifts, and fades.
 * Optional per-emoji counts render as small superscripts. Respects reduce-motion
 * (the fly-up degrades to nothing; the count still updates via the parent).
 *
 * REACTIONS is the canonical trash-talk emoji set, exported for reuse.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/components/ui';

/** Canonical trash-talk reaction set. */
export const REACTIONS = ['🔥', '😂', '💀', '😮', '🫡', '🤡'] as const;
export type Reaction = (typeof REACTIONS)[number];

interface Props {
  /** emoji → count, for the small superscript badges. */
  counts?: Partial<Record<string, number>>;
  /** Which emoji the viewer has already reacted with (highlighted). */
  mine?: string | null;
  onReact: (emoji: Reaction) => void;
}

interface FlyPiece {
  id: number;
  emoji: string;
  x: number;
}

export function ReactionBar({ counts = {}, mine, onReact }: Props) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pieces, setPieces] = useState<FlyPiece[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const removePiece = useCallback((id: number) => {
    setPieces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handle = (emoji: Reaction, x: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReact(emoji);
    if (reduceMotion) return;
    const id = nextId.current++;
    setPieces((prev) => [...prev, { id, emoji, x }]);
  };

  return (
    <View className="flex-row items-center gap-1.5">
      {REACTIONS.map((emoji, i) => {
        const count = counts[emoji] ?? 0;
        const isMine = mine === emoji;
        return (
          <Pressable
            key={emoji}
            onPress={() => handle(emoji, i * 34)}
            className={`flex-row items-center gap-0.5 rounded-pill border px-2 py-1 ${
              isMine ? 'border-jade/40 bg-jade/15' : 'border-hairline bg-surface-raised'
            }`}
          >
            <Txt style={{ fontSize: 15 }}>{emoji}</Txt>
            {count > 0 ? (
              <Txt variant="caption" className={isMine ? 'text-jade' : 'text-muted'}>
                {count}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}

      {/* Fly-up layer */}
      {pieces.map((p) => (
        <FlyUp key={p.id} emoji={p.emoji} x={p.x} onDone={() => removePiece(p.id)} />
      ))}
    </View>
  );
}

function FlyUp({ emoji, x, onDone }: { emoji: string; x: number; onDone: () => void }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
  }, [t, onDone]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -t.value * 70 },
      { translateX: Math.sin(t.value * Math.PI) * 14 },
      { scale: 0.8 + t.value * 0.5 },
    ],
    opacity: 1 - t.value,
  }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', bottom: 6, left: x }, style]}>
      <Txt style={{ fontSize: 24 }}>{emoji}</Txt>
    </Animated.View>
  );
}
