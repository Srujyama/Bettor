/**
 * Card-track server helper: the synthetic per-session "pot account" id.
 *
 * The canonical Firestore path builders for sessions/players/txns live in
 * `functions/src/lib/paths.ts` (owned by the Fixed-odds track per CARDS_SPEC) —
 * the Card-track callables import those directly. The only thing that has no home
 * in `paths` is the reserved LEDGER ACCOUNT id that holds a session's escrowed
 * Chips while a 'chips'-mode game is in progress: it's a user-doc sibling under a
 * reserved namespace so the double-entry ledger can debit/credit it like any
 * account, keeping the pot off every human player's balance until settle pays it
 * back out (conserved: every Chip bought in is paid out).
 */

/** Reserved ledger-account id holding a session's escrowed Chips (chips mode). */
export function sessionPotAccount(sessionId: string): string {
  return `session_pot:${sessionId}`;
}
