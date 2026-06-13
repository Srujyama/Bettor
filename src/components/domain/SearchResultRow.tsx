/**
 * SearchResultRow — one tappable result inside the global search modal. Renders a
 * leading avatar (people) or emoji glyph (bets, crews, fixtures), a primary title
 * with an optional subtitle, and a small type Pill on the trailing edge. Tapping
 * fires onPress with light haptic feedback. Presentational: data in via props.
 */
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Avatar, Pill, Txt } from '@/components/ui';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

interface Props {
  /** Leading avatar (people). When omitted, `glyph` renders instead. */
  avatarUri?: string | null;
  avatarName?: string;
  /** Leading emoji glyph for non-person rows (bets, crews, fixtures). */
  glyph?: string;
  title: string;
  subtitle?: string;
  /** Small label on the trailing edge (e.g. the result kind). */
  badge?: string;
  badgeTone?: PillTone;
  onPress: () => void;
}

export function SearchResultRow({
  avatarUri,
  avatarName,
  glyph,
  title,
  subtitle,
  badge,
  badgeTone = 'muted',
  onPress,
}: Props) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-card border border-hairline bg-surface px-3 py-3"
    >
      {glyph !== undefined ? (
        <View className="h-9 w-9 items-center justify-center rounded-full bg-surface-raised">
          <Txt style={{ fontSize: 20 }}>{glyph}</Txt>
        </View>
      ) : (
        <Avatar uri={avatarUri} name={avatarName} size={36} />
      )}
      <View className="flex-1">
        <Txt variant="label" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" muted numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {badge ? <Pill label={badge} tone={badgeTone} /> : null}
      <Txt variant="body" muted>
        ›
      </Txt>
    </Pressable>
  );
}
