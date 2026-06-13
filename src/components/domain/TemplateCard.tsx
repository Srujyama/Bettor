/**
 * TemplateCard — a one-tap quick-bet template tile (Templates library). Shows an
 * emoji, the prompt title, a short hint and the category. Tapping prefills the
 * create-bet modal via router params. Presentational: the template definition is
 * owned by the templates screen.
 */
import { Pressable, View } from 'react-native';
import { Pill, Txt } from '@/components/ui';

type PillTone = 'jade' | 'coral' | 'gold' | 'royal' | 'muted';

interface Props {
  emoji: string;
  title: string;
  hint?: string;
  categoryLabel?: string;
  tone?: PillTone;
  onPress: () => void;
}

export function TemplateCard({ emoji, title, hint, categoryLabel, tone = 'royal', onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-card border border-hairline bg-surface p-4"
      accessibilityRole="button"
      accessibilityLabel={`Use template: ${title}`}
    >
      <View className="h-12 w-12 items-center justify-center rounded-chip bg-surface-raised">
        <Txt style={{ fontSize: 24 }}>{emoji}</Txt>
      </View>
      <View className="flex-1 gap-1">
        <Txt variant="heading" numberOfLines={2}>
          {title}
        </Txt>
        {hint ? (
          <Txt variant="caption" muted numberOfLines={2}>
            {hint}
          </Txt>
        ) : null}
      </View>
      {categoryLabel ? <Pill label={categoryLabel} tone={tone} /> : null}
    </Pressable>
  );
}
