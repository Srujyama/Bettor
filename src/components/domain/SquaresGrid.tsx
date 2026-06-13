/**
 * SquaresGrid — the interactive N×N board (default 10×10). Each cell shows who
 * owns it: free (tappable), mine (jade), or someone else's (muted initial).
 * Once the board fills, the assigned row/col header digits render along the top
 * and left edges, and the winning cell (after settlement) glows gold.
 *
 * Presentational + interactive: tapping a free cell fires onClaim(index); the
 * actual escrow happens server-side via the claimSquare callable.
 */
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  size: number;
  cells: (string | null)[];
  rowDigits?: number[] | null;
  colDigits?: number[] | null;
  myUid?: string | null;
  /** Cell that won after settlement (gold glow). */
  winningCell?: number | null;
  /** Tap a FREE cell to claim it. Omit (or board not open) to make it read-only. */
  onClaim?: (cellIndex: number) => void;
  /** Map uid → display initial for other players' cells. */
  initials?: Record<string, string>;
}

export function SquaresGrid({
  size,
  cells,
  rowDigits,
  colDigits,
  myUid,
  winningCell,
  onClaim,
  initials,
}: Props) {
  const indices = useMemo(() => Array.from({ length: size }, (_, i) => i), [size]);

  return (
    <View className="gap-1">
      {/* Column header digits (assigned once full) */}
      {colDigits ? (
        <View className="flex-row">
          <View style={{ width: 18 }} />
          {indices.map((c) => (
            <View key={`ch${c}`} className="flex-1 items-center">
              <Txt variant="caption" className="text-gold" style={{ fontVariant: ['tabular-nums'] }}>
                {colDigits[c]}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}

      {indices.map((r) => (
        <View key={`r${r}`} className="flex-row items-center gap-1">
          {/* Row header digit */}
          <View style={{ width: 18 }} className="items-center">
            {rowDigits ? (
              <Txt variant="caption" className="text-gold" style={{ fontVariant: ['tabular-nums'] }}>
                {rowDigits[r]}
              </Txt>
            ) : null}
          </View>

          {indices.map((c) => {
            const idx = r * size + c;
            const owner = cells[idx] ?? null;
            const isMine = !!owner && owner === myUid;
            const isFree = owner == null;
            const isWinner = winningCell === idx;
            const tappable = isFree && !!onClaim;

            const bg = isWinner
              ? 'bg-gold/25 border-gold'
              : isMine
                ? 'bg-jade/20 border-jade/50'
                : isFree
                  ? 'bg-surface-raised border-hairline'
                  : 'bg-surface-sunken border-hairline';

            const label = isMine ? 'You' : owner ? (initials?.[owner] ?? '•') : '';

            return (
              <Pressable
                key={`c${idx}`}
                disabled={!tappable}
                onPress={() => onClaim?.(idx)}
                className={`aspect-square flex-1 items-center justify-center rounded-chip border ${bg}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !tappable }}
                accessibilityLabel={isFree ? `Claim square ${idx + 1}` : `Square ${idx + 1}`}
              >
                <Txt
                  variant="caption"
                  style={{ fontSize: 9, color: isMine ? colors.jade : colors.muted }}
                  numberOfLines={1}
                >
                  {label}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
