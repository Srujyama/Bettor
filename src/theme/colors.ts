/**
 * Chipd palette as JS tokens (mirror of tailwind.config.js) for places that
 * need raw color values: SVG, gradients, Reanimated, navigation theming.
 */
export const colors = {
  ink: '#0A0B0F',
  surface: '#14161D',
  surfaceRaised: '#1C1F28',
  surfaceSunken: '#0E1015',
  hairline: 'rgba(255,255,255,0.08)',

  jade: '#00E0A4',
  jadeDeep: '#00B383',
  jadeDim: 'rgba(0,224,164,0.14)',

  coral: '#FF5C7A',
  coralDeep: '#E0476A',
  coralDim: 'rgba(255,92,122,0.14)',

  gold: '#F5C451',
  goldDeep: '#E0A93C',
  goldDim: 'rgba(245,196,81,0.14)',

  royal: '#6C5CE7',
  royalDeep: '#5848C2',

  muted: '#8A8F9C',
  faint: '#5A5F6B',

  text: '#F2F4F8',
  textDim: '#A6ABB8',
  textFaint: '#6B7080',

  win: '#00E0A4',
  loss: '#FF5C7A',
  pending: '#F5C451',
  void: '#8A8F9C',
} as const;

export const gradients = {
  jade: ['#00E0A4', '#00B383'] as const,
  coral: ['#FF5C7A', '#E0476A'] as const,
  gold: ['#F5C451', '#E0A93C'] as const,
  royal: ['#6C5CE7', '#5848C2'] as const,
  foil: ['#F5C451', '#00E0A4', '#6C5CE7'] as const,
  ink: ['#14161D', '#0A0B0F'] as const,
};

/** Category → accent. */
export const categoryColor: Record<string, string> = {
  sports: colors.jade,
  weather: colors.royal,
  social: colors.coral,
  gaming: colors.gold,
  custom: colors.muted,
  prop: colors.royal,
};
