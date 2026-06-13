/**
 * Draining countdown ring. Turns coral and pulses calmly under 60s. Used on bet
 * cards and the bet detail header to make the deadline visceral.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Txt } from './Text';
import { colors } from '@/theme';

interface Props {
  /** epoch millis when entries lock. */
  lockAt: number;
  /** when the bet was created (for the ring's full extent). */
  createdAt?: number;
  size?: number;
  stroke?: number;
}

function fmt(ms: number): string {
  if (ms <= 0) return 'Locked';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function CountdownRing({ lockAt, createdAt, size = 64, stroke = 5 }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = lockAt - now;
  const total = lockAt - (createdAt ?? lockAt - 24 * 3600 * 1000);
  const pct = Math.max(0, Math.min(1, remaining / Math.max(1, total)));
  const urgent = remaining > 0 && remaining < 60_000;
  const ringColor = remaining <= 0 ? colors.void : urgent ? colors.coral : colors.jade;

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairline} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Txt variant="caption" style={{ color: ringColor, fontWeight: '700' }}>
        {fmt(remaining)}
      </Txt>
    </View>
  );
}
