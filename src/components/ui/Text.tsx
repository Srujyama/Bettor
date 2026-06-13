import { Text as RNText, TextProps } from 'react-native';
import { cssInterop } from 'nativewind';

cssInterop(RNText, { className: 'style' });

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';

const VARIANT: Record<Variant, string> = {
  display: 'text-text font-display text-5xl tracking-tight',
  title: 'text-text font-display text-3xl tracking-tight',
  heading: 'text-text font-sans text-xl font-semibold',
  body: 'text-text font-sans text-base',
  label: 'text-text font-sans text-sm font-medium',
  caption: 'text-text-dim font-sans text-xs',
  mono: 'text-text-dim font-mono text-xs',
};

interface Props extends TextProps {
  variant?: Variant;
  className?: string;
  dim?: boolean;
  muted?: boolean;
}

export function Txt({ variant = 'body', className = '', dim, muted, ...rest }: Props) {
  const color = dim ? 'text-text-dim' : muted ? 'text-muted' : '';
  return <RNText className={`${VARIANT[variant]} ${color} ${className}`} {...rest} />;
}
