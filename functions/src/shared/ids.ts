/**
 * Deterministic-ish id helpers shared by app + functions.
 * - shareCode: short, human-shareable, URL-safe (deep-link invites).
 * - ULID-lite: lexicographically sortable id for ledger entries (time-prefixed).
 *
 * Note: the authoritative ULID for ledger entries is generated server-side with
 * the `ulid` package in Functions (re-exported below as `newUlid`). The client
 * variant `makeId` is for optimistic ids and share codes only.
 *
 * NOTE: The pure helpers below are a byte-identical COPY of src/shared/ids.ts.
 * Keep them in sync. The `newUlid` export is server-only.
 */

import { ulid } from 'ulid';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I,L,O,U)

function randomChar(): string {
  return ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
}

/** A 6-char share code, e.g. "K7P2QX". 32^6 ≈ 1.07B — plenty for the pilot. */
export function makeShareCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += randomChar();
  return s;
}

/** Random 20-char client id (collision-safe enough for optimistic UI). */
export function makeId(prefix = ''): string {
  let s = '';
  for (let i = 0; i < 20; i++) s += randomChar();
  return prefix ? `${prefix}_${s}` : s;
}

/** An idempotency key for a mutation; callers should reuse it across retries. */
export function makeIdempotencyKey(): string {
  return makeId('idem');
}

/**
 * Server-authoritative, monotonic, lexicographically-sortable ledger entry id.
 * Uses the `ulid` package (26-char Crockford base32, time-prefixed).
 */
export function newUlid(): string {
  return ulid();
}
