export { colors, gradients, categoryColor } from './colors';

/** Spacing scale (4pt grid). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  chip: 12,
  card: 20,
  sheet: 28,
  pill: 999,
} as const;

/** Layered shadow presets (iOS). */
// Matte: elevation comes from surface-step + hairline borders, not glow. Cards
// carry no shadow at all; only genuinely-floating chrome (the FAB, modals) gets
// a soft, low-opacity shadow so it lifts off the page without looking glossy.
export const shadow = {
  card: {
    // Flat — matte cards lift via their lighter surface + hairline, not a halo.
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  float: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
