/**
 * PriceChart — the larger market price area for the detail screen. Draws the YES
 * price history (cents 1..99) as a filled line chart with a 50¢ guide line and a
 * current-price dot. If history is empty it draws a flat line at the current
 * price so the area never looks broken. Presentational; reduce-motion safe (no
 * animation). Pass `history` oldest→newest plus the live `currentCents`.
 */
import { View } from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

interface Props {
  history: number[];
  currentCents: number;
  width: number;
  height?: number;
}

export function PriceChart({ history, currentCents, width, height = 160 }: Props) {
  const series = (history.length > 0 ? history : [currentCents]).concat(
    history.length > 0 && history[history.length - 1] !== currentCents ? [currentCents] : [],
  );
  const pad = 6;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const n = series.length;
  const x = (i: number) => pad + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (c: number) => pad + (1 - Math.max(0, Math.min(100, c)) / 100) * h;

  const up = series[series.length - 1] >= series[0];
  const stroke = up ? colors.jade : colors.coral;

  const linePath =
    n === 1
      ? `M ${pad} ${y(series[0])} L ${pad + w} ${y(series[0])}`
      : series.map((c, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(' ');

  const areaPath =
    n === 1
      ? `M ${pad} ${y(series[0])} L ${pad + w} ${y(series[0])} L ${pad + w} ${pad + h} L ${pad} ${pad + h} Z`
      : `${linePath} L ${x(n - 1).toFixed(1)} ${pad + h} L ${x(0).toFixed(1)} ${pad + h} Z`;

  const midY = y(50);
  const lastX = n === 1 ? pad + w : x(n - 1);
  const lastY = y(series[series.length - 1]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* 50¢ guide */}
        <Line
          x1={pad}
          y1={midY}
          x2={pad + w}
          y2={midY}
          stroke={colors.hairline}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <Path d={areaPath} fill="url(#priceArea)" />
        <Path d={linePath} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={lastX} cy={lastY} r={4} fill={stroke} stroke={colors.ink} strokeWidth={1.5} />
      </Svg>
      <View
        style={{ position: 'absolute', right: 8, top: 4 }}
        pointerEvents="none"
      >
        <Txt variant="caption" muted>
          50¢
        </Txt>
      </View>
    </View>
  );
}
