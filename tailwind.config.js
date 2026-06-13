/** @type {import('tailwindcss').Config} */
// Chipd design tokens — "private members' card room meets group chat".
// Dark-first. Jade = your money/win. Coral = the other side/urgency. Gold = prestige.
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Base surfaces (dark-first)
        ink: '#0A0B0F',
        surface: {
          DEFAULT: '#14161D',
          raised: '#1C1F28',
          sunken: '#0E1015',
        },
        hairline: 'rgba(255,255,255,0.08)',
        // Jade — your money / your action / win
        jade: {
          DEFAULT: '#00E0A4',
          deep: '#00B383',
          dim: 'rgba(0,224,164,0.14)',
        },
        // Coral — the other side / urgency (calm, not panic)
        coral: {
          DEFAULT: '#FF5C7A',
          deep: '#E0476A',
          dim: 'rgba(255,92,122,0.14)',
        },
        // Gold — prestige only (leaderboards, big wins, badges)
        gold: {
          DEFAULT: '#F5C451',
          deep: '#E0A93C',
          dim: 'rgba(245,196,81,0.14)',
        },
        // Royal — secondary / links
        royal: {
          DEFAULT: '#6C5CE7',
          deep: '#5848C2',
        },
        // Semantic neutrals
        muted: '#8A8F9C',
        faint: '#5A5F6B',
        // Text
        text: {
          DEFAULT: '#F2F4F8',
          dim: '#A6ABB8',
          faint: '#6B7080',
        },
      },
      borderRadius: {
        chip: '12px',
        card: '20px',
        sheet: '28px',
      },
      fontFamily: {
        // Loaded via expo-font in src/theme/fonts.ts; fall back to system.
        display: ['ClashDisplay', 'System'],
        sans: ['Inter', 'System'],
        mono: ['GeistMono', 'Courier'],
      },
      fontSize: {
        '2xs': '11px',
      },
    },
  },
  plugins: [],
};
