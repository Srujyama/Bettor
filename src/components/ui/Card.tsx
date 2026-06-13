import { View, ViewProps, Pressable } from 'react-native';
import { cssInterop } from 'nativewind';

cssInterop(View, { className: 'style' });

interface Props extends ViewProps {
  className?: string;
  onPress?: () => void;
  raised?: boolean;
}

export function Card({ className = '', onPress, raised, children, ...rest }: Props) {
  const base = `rounded-card border border-hairline ${raised ? 'bg-surface-raised' : 'bg-surface'} p-4`;
  if (onPress) {
    return (
      <Pressable onPress={onPress} className={`${base} ${className}`}>
        {children}
      </Pressable>
    );
  }
  return (
    <View className={`${base} ${className}`} {...rest}>
      {children}
    </View>
  );
}
