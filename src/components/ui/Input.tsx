import { TextInput, TextInputProps, View } from 'react-native';
import { cssInterop } from 'nativewind';
import { Txt } from './Text';
import { colors } from '@/theme';

cssInterop(TextInput, { className: 'style' });

interface Props extends TextInputProps {
  label?: string;
  error?: string | null;
  className?: string;
  prefix?: string;
}

export function Input({ label, error, className = '', prefix, ...rest }: Props) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Txt variant="label" dim>
          {label}
        </Txt>
      ) : null}
      <View
        className={`flex-row items-center rounded-chip border bg-surface-raised px-4 ${
          error ? 'border-coral/60' : 'border-hairline'
        }`}
      >
        {prefix ? (
          <Txt variant="body" muted className="mr-1">
            {prefix}
          </Txt>
        ) : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
          className={`flex-1 py-3.5 font-sans text-base text-text ${className}`}
          {...rest}
        />
      </View>
      {error ? (
        <Txt variant="caption" className="text-coral">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}
