import { View } from 'react-native';
import { Image } from 'expo-image';
import { Txt } from './Text';
import { colors } from '@/theme';

interface Props {
  uri?: string | null;
  name?: string;
  size?: number;
  ring?: boolean;
}

const RING_COLORS = [colors.jade, colors.coral, colors.gold, colors.royal];

function initials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export function Avatar({ uri, name, size = 40, ring }: Props) {
  const bg = RING_COLORS[(name?.charCodeAt(0) ?? 0) % RING_COLORS.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: uri ? colors.surfaceRaised : `${bg}33`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2 : 0,
        borderColor: bg,
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
        />
      ) : (
        <Txt style={{ color: bg, fontWeight: '700', fontSize: size * 0.4 }}>{initials(name)}</Txt>
      )}
    </View>
  );
}
