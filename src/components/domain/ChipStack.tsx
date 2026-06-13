/**
 * ChipStack — a physical stack of casino tokens visualizing an amount. The
 * taller / wider the stack, the more Chips. Chips are colored by denomination
 * tier so a big stack reads as "lots of high-value tokens". Pure presentational
 * SVG; no money is computed here (display only).
 */
import { View } from 'react-native';
import Svg, { Ellipse, Rect, G } from 'react-native-svg';
import { colors } from '@/theme';
import { CHIP_DENOMINATIONS } from '@/shared/constants';

interface Props {
  /** Chip amount to visualize. */
  amount: number;
  /** Diameter of a single token in px. Drives the whole stack scale. */
  size?: number;
}

/** Denomination → token face/edge color. Higher value = richer color. */
const TIER_COLOR: Record<number, { face: string; edge: string }> = {
  10: { face: colors.surfaceRaised, edge: colors.muted },
  25: { face: colors.jadeDeep, edge: colors.jade },
  50: { face: colors.royalDeep, edge: colors.royal },
  100: { face: colors.coralDeep, edge: colors.coral },
  250: { face: colors.royal, edge: colors.gold },
  500: { face: colors.coral, edge: colors.gold },
  1_000: { face: colors.goldDeep, edge: colors.gold },
};

/**
 * Greedily break `amount` into tokens drawn from CHIP_DENOMINATIONS (largest
 * first), capped so a single stack never gets absurdly tall. Returns the list
 * of token denominations from bottom (largest) to top (smallest).
 */
function tokenize(amount: number, maxTokens: number): number[] {
  const tokens: number[] = [];
  let remaining = Math.max(0, Math.trunc(amount));
  const denoms = [...CHIP_DENOMINATIONS].sort((a, b) => b - a);
  for (const d of denoms) {
    while (remaining >= d && tokens.length < maxTokens) {
      tokens.push(d);
      remaining -= d;
    }
  }
  // Anything left over (smaller than the min denom) becomes one low token.
  if (remaining > 0 && tokens.length < maxTokens) tokens.push(CHIP_DENOMINATIONS[0]);
  if (tokens.length === 0) tokens.push(CHIP_DENOMINATIONS[0]);
  return tokens;
}

export function ChipStack({ amount, size = 44 }: Props) {
  const maxTokens = 14;
  // Largest first so they sit at the bottom of the stack.
  const tokens = tokenize(amount, maxTokens);

  const w = size;
  const tokenH = size * 0.22; // visible edge thickness of one token
  const overlap = tokenH * 0.55; // how much each token covers the one below
  const ellipseRy = size * 0.18;
  const stackHeight = ellipseRy * 2 + tokenH + (tokens.length - 1) * overlap;
  const svgHeight = stackHeight + size * 0.1;
  const cx = w / 2;
  const rx = w / 2 - 1;

  return (
    <View style={{ width: w, height: svgHeight }}>
      <Svg width={w} height={svgHeight}>
        {tokens.map((denom, i) => {
          const tier = TIER_COLOR[denom] ?? TIER_COLOR[CHIP_DENOMINATIONS[0]];
          // Bottom token is index 0; stack upward.
          const fromBottom = i;
          const topY = svgHeight - ellipseRy - tokenH - fromBottom * overlap;
          return (
            <G key={`${denom}-${i}`}>
              {/* token edge (the cylindrical side) */}
              <Rect
                x={cx - rx}
                y={topY}
                width={rx * 2}
                height={tokenH}
                fill={tier.edge}
                opacity={0.9}
              />
              {/* token top face */}
              <Ellipse cx={cx} cy={topY} rx={rx} ry={ellipseRy} fill={tier.face} />
              <Ellipse
                cx={cx}
                cy={topY}
                rx={rx}
                ry={ellipseRy}
                fill="none"
                stroke={tier.edge}
                strokeWidth={Math.max(1, size * 0.03)}
              />
              {/* center pip for a printed-token feel */}
              <Ellipse cx={cx} cy={topY} rx={rx * 0.42} ry={ellipseRy * 0.42} fill="none" stroke={tier.edge} strokeWidth={Math.max(0.5, size * 0.015)} opacity={0.6} />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
