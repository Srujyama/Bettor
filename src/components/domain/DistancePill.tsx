/**
 * DistancePill — a small "📍 2.4 km away · Taipa" chip for local bets. Shows an
 * approximate distance and the coarse neighborhood label (never an exact spot).
 */
import { View } from 'react-native';
import { Txt } from '@/components/ui';
import { formatDistance } from '@/shared/geo';
import { colors } from '@/theme';

interface Props {
  distanceMeters?: number | null;
  placeName?: string | null;
}

export function DistancePill({ distanceMeters, placeName }: Props) {
  const dist =
    distanceMeters != null && Number.isFinite(distanceMeters) ? formatDistance(distanceMeters) : null;
  if (!dist && !placeName) return null;
  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-pill border border-jade/30 bg-jade/10 px-2.5 py-1"
      style={{ borderColor: `${colors.jade}55` }}
    >
      <Txt variant="caption" style={{ color: colors.jade, fontWeight: '700' }}>
        📍 {dist}
        {dist && placeName ? ' · ' : ''}
        {placeName ?? ''}
      </Txt>
    </View>
  );
}
