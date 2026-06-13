/**
 * LevelRing — an XP progress ring (react-native-svg) with the level number in
 * the center. Purely presentational; pass a total XP value and it resolves the
 * level + progress via the shared curve. Used on the profile and the XP screen.
 */
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';
import { levelFromXp } from '@/shared/gamification';

interface Props {
  /** Total lifetime XP — the ring resolves level + progress from this. */
  xp: number;
  size?: number;
  stroke?: number;
  /** Show the "Lv" caption under the number. */
  showLabel?: boolean;
}

export function LevelRing({ xp, size = 96, stroke = 8, showLabel = true }: Props) {
  const { level, progress, intoLevel, span } = levelFromXp(xp);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <SvgGradient id="levelRingGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.jade} />
            <Stop offset="1" stopColor={colors.gold} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairline} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#levelRingGrad)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ alignItems: 'center' }}>
        {showLabel ? (
          <Txt variant="caption" muted style={{ marginBottom: -2 }}>
            LEVEL
          </Txt>
        ) : null}
        <Txt variant="title" style={{ color: colors.text, fontWeight: '800' }}>
          {level}
        </Txt>
        {showLabel ? (
          <Txt variant="caption" muted style={{ marginTop: -2 }}>
            {intoLevel}/{span} XP
          </Txt>
        ) : null}
      </View>
    </View>
  );
}
