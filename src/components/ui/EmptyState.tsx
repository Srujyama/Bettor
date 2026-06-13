import { View } from 'react-native';
import { Txt } from './Text';
import { Button } from './Button';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji = '🎲', title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 py-16">
      <Txt style={{ fontSize: 56 }}>{emoji}</Txt>
      <Txt variant="heading" className="text-center">
        {title}
      </Txt>
      {subtitle ? (
        <Txt variant="body" dim className="text-center">
          {subtitle}
        </Txt>
      ) : null}
      {actionLabel && onAction ? (
        <View className="mt-2 w-48">
          <Button label={actionLabel} onPress={onAction} size="sm" />
        </View>
      ) : null}
    </View>
  );
}
