/**
 * StatBadge — a small stat tile (label + big value) for profiles and headers.
 * Purely presentational. Tone tints the value text.
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';

type Tone = 'jade' | 'coral' | 'gold' | 'royal' | 'default';

const VALUE_TONE: Record<Tone, string> = {
  jade: 'text-jade',
  coral: 'text-coral',
  gold: 'text-gold',
  royal: 'text-royal',
  default: 'text-text',
};

interface Props {
  label: string;
  value: string | number;
  tone?: Tone;
  className?: string;
}

export function StatBadge({ label, value, tone = 'default', className = '' }: Props) {
  return (
    <View
      className={`flex-1 items-center gap-1 rounded-card border border-hairline bg-surface px-3 py-3 ${className}`}
    >
      <Txt variant="heading" className={`${VALUE_TONE[tone]} text-2xl`}>
        {value}
      </Txt>
      <Txt variant="caption" muted className="uppercase tracking-wide">
        {label}
      </Txt>
    </View>
  );
}
