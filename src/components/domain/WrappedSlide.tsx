/**
 * WrappedSlide — one full-bleed story slide for "Chipd Wrapped". A gradient
 * background, a big stat, a kicker and a caption. The final shareable card reuses
 * this with `card` styling so react-native-view-shot can snapshot it. Presentational.
 */
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Txt } from '@/components/ui';
import { colors } from '@/theme';

type SlideTone = 'jade' | 'coral' | 'gold' | 'royal' | 'ink';

const TONE_GRADIENT: Record<SlideTone, readonly [string, string]> = {
  jade: ['#00B383', '#063D31'],
  coral: ['#E0476A', '#3D0E1B'],
  gold: ['#E0A93C', '#3D2E0C'],
  royal: ['#5848C2', '#15103D'],
  ink: ['#1C1F28', '#0A0B0F'],
};

interface Props {
  /** Small label above the headline (e.g. "BETS PLACED"). */
  kicker: string;
  /** The hero value — usually a big number or short phrase. */
  headline: string;
  /** A sentence of context under the headline. */
  caption?: string;
  emoji?: string;
  tone?: SlideTone;
  width: number;
  /** When true, render compact card chrome for the shareable snapshot. */
  card?: boolean;
}

export function WrappedSlide({ kicker, headline, caption, emoji, tone = 'jade', width, card }: Props) {
  return (
    <LinearGradient
      colors={TONE_GRADIENT[tone]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width,
        flex: card ? undefined : 1,
        borderRadius: card ? 24 : 0,
        paddingVertical: card ? 36 : 0,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {emoji ? <Txt style={{ fontSize: card ? 52 : 64, marginBottom: 12 }}>{emoji}</Txt> : null}
      <Txt
        variant="label"
        style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' }}
      >
        {kicker}
      </Txt>
      <Txt
        style={{
          color: colors.text,
          fontSize: card ? 44 : 56,
          fontWeight: '900',
          textAlign: 'center',
          marginVertical: 8,
        }}
      >
        {headline}
      </Txt>
      {caption ? (
        <Txt variant="body" style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center' }}>
          {caption}
        </Txt>
      ) : null}
      {card ? (
        <Txt variant="caption" style={{ color: 'rgba(255,255,255,0.6)', marginTop: 20 }}>
          Chipd Wrapped · chips are for entertainment only
        </Txt>
      ) : null}
    </LinearGradient>
  );
}
