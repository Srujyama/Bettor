import { View, ViewProps, Pressable } from 'react-native';
import { cssInterop } from 'nativewind';

cssInterop(View, { className: 'style' });

interface Props extends ViewProps {
  className?: string;
  onPress?: () => void;
  raised?: boolean;
  /**
   * Optional bold left-edge accent bar (a category/tone color). This is the
   * "more interesting than plain matte" signature — a flat matte surface with
   * one confident accent stripe instead of a glossy gradient or a glow. Pass a
   * resolved color string (e.g. categoryColor[bet.category]).
   */
  accent?: string;
}

export function Card({ className = '', onPress, raised, accent, children, ...rest }: Props) {
  // Matte elevation: a hairline border + a step-lighter surface, no shadow.
  // overflow-hidden so the accent bar clips to the rounded corners.
  const base = `relative overflow-hidden rounded-card border border-hairline ${
    raised ? 'bg-surface-raised' : 'bg-surface'
  } p-4`;

  const inner = (
    <>
      {accent ? (
        <View
          style={{ backgroundColor: accent }}
          className="absolute left-0 top-0 bottom-0 w-1"
        />
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={`${base} ${className}`}
        style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View className={`${base} ${className}`} {...rest}>
      {inner}
    </View>
  );
}
