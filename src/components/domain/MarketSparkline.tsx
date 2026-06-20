/**
 * MarketSparkline — a tiny SVG line of a market's YES-price history (in cents,
 * 1..99). Presentational: pass an array of cent values oldest→newest. With one
 * point it draws a flat line at that level. Color follows the trend (jade when
 * the last point is up vs the first, coral when down). No axes, no labels — it's
 * a glanceable trend chip for cards/feeds.
 */
import { View } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { colors } from '@/theme';

interface Props {
  /** YES price history in cents (1..99), oldest first. */
  history: number[];
  width?: number;
  height?: number;
}

function buildPath(points: number[], width: number, height: number): string {
  if (points.length === 0) return '';
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const n = points.length;
  const x = (i: number) => pad + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  // cents 1..99 → y (higher price = higher on screen)
  const y = (c: number) => pad + (1 - Math.max(0, Math.min(100, c)) / 100) * h;
  if (n === 1) {
    const yy = y(points[0]);
    return `M ${pad} ${yy} L ${pad + w} ${yy}`;
  }
  return points.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(' ');
}

export function MarketSparkline({ history, width = 72, height = 28 }: Props) {
  const pts = history.length > 0 ? history : [50];
  const up = pts[pts.length - 1] >= pts[0];
  const stroke = up ? colors.jade : colors.coral;
  const d = buildPath(pts, width, height);
  const midY = 2 + (1 - 0.5) * (height - 4);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Line x1={0} y1={midY} x2={width} y2={midY} stroke={colors.hairline} strokeWidth={1} />
        <Path d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
