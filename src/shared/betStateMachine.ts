/**
 * Bet lifecycle state machine. The ONLY legal transitions are encoded here and
 * enforced server-side in Cloud Functions (rules deny client status writes
 * entirely). Pure, no dependencies.
 *
 *   draft → open → locked → pending_resolution → resolved → settled
 *                                     ↓                ↑
 *                                 disputed ───────────┘
 *   (open|locked|pending_resolution|disputed) → voided   (auto-void / unresolvable → refund all)
 *   draft → cancelled                                    (creator scraps a draft)
 *   open → cancelled                                     (creator cancels before anyone joins)
 */

import { BetStatus, BET_STATUS } from './constants';

const TRANSITIONS: Record<BetStatus, BetStatus[]> = {
  [BET_STATUS.DRAFT]: [BET_STATUS.OPEN, BET_STATUS.CANCELLED],
  [BET_STATUS.OPEN]: [BET_STATUS.LOCKED, BET_STATUS.CANCELLED, BET_STATUS.VOIDED],
  [BET_STATUS.LOCKED]: [BET_STATUS.PENDING_RESOLUTION, BET_STATUS.VOIDED],
  [BET_STATUS.PENDING_RESOLUTION]: [
    BET_STATUS.RESOLVED,
    BET_STATUS.DISPUTED,
    BET_STATUS.VOIDED,
  ],
  [BET_STATUS.DISPUTED]: [BET_STATUS.RESOLVED, BET_STATUS.VOIDED],
  [BET_STATUS.RESOLVED]: [BET_STATUS.SETTLED],
  [BET_STATUS.SETTLED]: [], // terminal
  [BET_STATUS.CANCELLED]: [], // terminal
  [BET_STATUS.VOIDED]: [], // terminal
};

export function canTransition(from: BetStatus, to: BetStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BetStatus, to: BetStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal bet transition: ${from} → ${to}`);
  }
}

export function isTerminal(status: BetStatus): boolean {
  return TRANSITIONS[status]?.length === 0;
}

/** A bet accepts new entries only while open. */
export function acceptsEntries(status: BetStatus): boolean {
  return status === BET_STATUS.OPEN;
}

/** Chips are escrowed (held, not yet won/lost) in these states. */
export function isEscrowed(status: BetStatus): boolean {
  return (
    status === BET_STATUS.OPEN ||
    status === BET_STATUS.LOCKED ||
    status === BET_STATUS.PENDING_RESOLUTION ||
    status === BET_STATUS.DISPUTED ||
    status === BET_STATUS.RESOLVED
  );
}

/** A participant may withdraw (cancelEntry) only before lock. */
export function allowsCancel(status: BetStatus): boolean {
  return status === BET_STATUS.OPEN;
}
