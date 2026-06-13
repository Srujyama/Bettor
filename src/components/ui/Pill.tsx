import { View } from 'react-native';
import { Txt } from './Text';

type Tone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

const TONE: Record<Tone, string> = {
  jade: 'bg-jade/15 border-jade/30',
  coral: 'bg-coral/15 border-coral/30',
  gold: 'bg-gold/15 border-gold/30',
  royal: 'bg-royal/15 border-royal/30',
  muted: 'bg-white/5 border-hairline',
};
const TEXT: Record<Tone, string> = {
  jade: 'text-jade',
  coral: 'text-coral',
  gold: 'text-gold',
  royal: 'text-royal',
  muted: 'text-muted',
};

export function Pill({
  label,
  tone = 'muted',
  icon,
}: {
  label: string;
  tone?: Tone;
  icon?: React.ReactNode;
}) {
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-pill border px-2.5 py-1 ${TONE[tone]}`}>
      {icon}
      <Txt variant="caption" className={`${TEXT[tone]} font-semibold`}>
        {label}
      </Txt>
    </View>
  );
}
