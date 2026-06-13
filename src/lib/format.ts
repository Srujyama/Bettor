/** Misc display helpers shared across screens. */
import { formatDistanceToNowStrict, format } from 'date-fns';
import { LEDGER_REASON } from '@/shared/constants';

export function relativeTime(epochMs: number): string {
  if (!epochMs) return '';
  return formatDistanceToNowStrict(new Date(epochMs), { addSuffix: true });
}

export function shortDate(epochMs: number): string {
  if (!epochMs) return '';
  return format(new Date(epochMs), 'd MMM, HH:mm');
}

export function dayMonth(epochMs: number): string {
  return format(new Date(epochMs), 'd MMM');
}

/** Human label for a ledger reason. */
export const LEDGER_LABEL: Record<string, string> = {
  [LEDGER_REASON.SIGNUP_GRANT]: 'Welcome bonus',
  [LEDGER_REASON.DAILY_GRANT]: 'Daily Chips',
  [LEDGER_REASON.ZERO_REFILL]: 'Refill',
  [LEDGER_REASON.REFERRAL_BONUS]: 'Referral bonus',
  [LEDGER_REASON.ACHIEVEMENT_GRANT]: 'Achievement reward',
  [LEDGER_REASON.STAKE_ESCROW]: 'Stake placed',
  [LEDGER_REASON.STAKE_REFUND]: 'Stake refunded',
  [LEDGER_REASON.PAYOUT]: 'Winnings',
  [LEDGER_REASON.RAKE]: 'House fee',
  [LEDGER_REASON.ADMIN_ADJUSTMENT]: 'Adjustment',
  [LEDGER_REASON.REVERSAL]: 'Reversal',
};

export function ledgerLabel(reason: string): string {
  return LEDGER_LABEL[reason] ?? reason;
}

/** Pluralize simply. */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? one + 's')}`;
}
