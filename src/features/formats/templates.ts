/**
 * Quick-bet TEMPLATES — a curated library of one-tap bet prompts plus the
 * router-param contract for prefilling the existing create-bet modal.
 *
 * A template (or a "rematch" of a prior bet) routes to /(modals)/create-bet with
 * a flat set of string params. The create-bet wizard reads these to pre-populate
 * its first steps. Outcomes are passed as a `|`-separated string so they survive
 * the URL param boundary; helpers below build + parse that contract.
 */
import { router, type Href } from 'expo-router';
import { BET_CATEGORY, BET_TYPE, type BetCategory, type BetType } from '@/shared/constants';

export interface BetTemplate {
  key: string;
  emoji: string;
  title: string;
  hint: string;
  category: BetCategory;
  type: BetType;
  /** Outcome labels; omitted → the wizard's default for the type (e.g. Yes/No). */
  outcomes?: string[];
  /** Pill tone for the card. */
  tone: 'jade' | 'coral' | 'gold' | 'royal' | 'muted';
}

/** Prefill params accepted by the create-bet modal (all strings for the URL). */
export interface CreateBetPrefill {
  title?: string;
  description?: string;
  category?: BetCategory;
  type?: BetType;
  /** `|`-separated outcome labels. */
  outcomes?: string;
}

export const BET_TEMPLATES: BetTemplate[] = [
  {
    key: 'rain-tomorrow',
    emoji: '🌧️',
    title: 'Will it rain tomorrow?',
    hint: 'Macau weather, settled by the morning forecast.',
    category: BET_CATEGORY.WEATHER,
    type: BET_TYPE.BINARY,
    tone: 'royal',
  },
  {
    key: 'who-late',
    emoji: '⏰',
    title: 'Will ___ be late?',
    hint: 'The eternal group-chat question.',
    category: BET_CATEGORY.SOCIAL,
    type: BET_TYPE.BINARY,
    tone: 'coral',
  },
  {
    key: 'next-round',
    emoji: '🍸',
    title: "Who's buying the next round?",
    hint: 'Pick a name, loser pays.',
    category: BET_CATEGORY.SOCIAL,
    type: BET_TYPE.MULTI,
    outcomes: ['Me', 'You', 'Someone else'],
    tone: 'coral',
  },
  {
    key: 'match-winner',
    emoji: '⚽',
    title: 'Who wins the match?',
    hint: 'Home, away, or draw.',
    category: BET_CATEGORY.SPORTS,
    type: BET_TYPE.MULTI,
    outcomes: ['Home', 'Away', 'Draw'],
    tone: 'jade',
  },
  {
    key: 'total-goals',
    emoji: '🥅',
    title: 'Over/under total goals',
    hint: 'Set the line, back a side.',
    category: BET_CATEGORY.SPORTS,
    type: BET_TYPE.OVER_UNDER,
    tone: 'jade',
  },
  {
    key: 'rank-push',
    emoji: '🎮',
    title: 'Will we hit the next rank tonight?',
    hint: 'Ranked grind accountability.',
    category: BET_CATEGORY.GAMING,
    type: BET_TYPE.BINARY,
    tone: 'gold',
  },
  {
    key: 'first-to-arrive',
    emoji: '🚕',
    title: "Who's first to arrive?",
    hint: 'Name the early bird.',
    category: BET_CATEGORY.SOCIAL,
    type: BET_TYPE.HEAD_TO_HEAD,
    outcomes: ['Me', 'You'],
    tone: 'coral',
  },
  {
    key: 'coin-flip',
    emoji: '🪙',
    title: 'Heads or tails?',
    hint: 'Settle anything, instantly.',
    category: BET_CATEGORY.CUSTOM,
    type: BET_TYPE.BINARY,
    outcomes: ['Heads', 'Tails'],
    tone: 'muted',
  },
];

/** Build the modal href with prefill params (omitting empty fields). */
export function createBetHref(prefill: CreateBetPrefill): Href {
  const params: Record<string, string> = {};
  if (prefill.title) params.title = prefill.title;
  if (prefill.description) params.description = prefill.description;
  if (prefill.category) params.category = prefill.category;
  if (prefill.type) params.type = prefill.type;
  if (prefill.outcomes) params.outcomes = prefill.outcomes;
  return { pathname: '/(modals)/create-bet', params } as Href;
}

/** Open the create-bet modal prefilled from a template. */
export function openTemplate(template: BetTemplate): void {
  router.push(
    createBetHref({
      title: template.title,
      category: template.category,
      type: template.type,
      outcomes: template.outcomes?.join('|'),
    }),
  );
}

/**
 * REMATCH — re-create a prior bet by pushing the create-bet modal prefilled from
 * its title/category/type/outcomes. Use from a settled bet's detail screen.
 */
export function rematch(bet: {
  title: string;
  category?: string;
  type?: string;
  outcomes?: { label: string }[];
}): void {
  router.push(
    createBetHref({
      title: bet.title,
      category: bet.category as BetCategory | undefined,
      type: bet.type as BetType | undefined,
      outcomes: bet.outcomes?.map((o) => o.label).join('|'),
    }),
  );
}
