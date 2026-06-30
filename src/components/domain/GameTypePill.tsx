/**
 * GameTypePill — a compact label for a session's card game (poker cash, poker
 * tournament, blackjack, generic) with a glyph + tone. Presentational only.
 */
import { Pill } from '@/components/ui';
import type { CardGameType } from '@/shared/schemas-cards';

const META: Record<CardGameType, { label: string; glyph: string; tone: 'jade' | 'coral' | 'gold' | 'royal' }> = {
  poker_cash: { label: 'Poker · Cash', glyph: '♠️', tone: 'jade' },
  poker_tournament: { label: 'Poker · Tourney', glyph: '🏆', tone: 'gold' },
  blackjack: { label: 'Blackjack', glyph: '🃏', tone: 'coral' },
  generic: { label: 'Card game', glyph: '🎴', tone: 'royal' },
};

export function GameTypePill({ gameType }: { gameType: CardGameType }) {
  const m = META[gameType] ?? META.generic;
  return <Pill label={`${m.glyph} ${m.label}`} tone={m.tone} />;
}
