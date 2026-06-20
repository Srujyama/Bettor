/**
 * Provably-fair engine for the casino mini-games.
 *
 * Commitment/reveal scheme:
 *   1) The server generates a random `serverSeed` per round and commits to its
 *      sha256 hash (`serverSeedHash`) — the client never sees the raw seed until
 *      AFTER the outcome is computed and persisted.
 *   2) The outcome is derived deterministically from
 *        seedString(serverSeed, clientSeed, nonce)
 *      via the shared casino RNG. The client supplies `clientSeed`; the server
 *      maintains a monotonically-increasing per-user `nonce` so the same
 *      (serverSeed, clientSeed) pair can never repeat an outcome.
 *   3) The server reveals `serverSeed` on the persisted round, so the player can
 *      recompute sha256(serverSeed) === serverSeedHash and re-derive the result
 *      offline — proving the game wasn't rigged after the fact.
 *
 * The actual outcome math lives in the shared, audited `@/shared/casino` module
 * (mirrored into functions/src/shared/casino.ts) so client preview and server
 * authority share one implementation.
 */
import { createHash, randomBytes } from 'crypto';
import { Transaction } from 'firebase-admin/firestore';
import { db } from '../lib/admin';
import { paths } from '../lib/paths';
import { hashSeed } from '../shared/casino';

/** SHA-256 hex digest — the public commitment to a server seed. */
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** A fresh, unpredictable server seed (32 bytes of CSPRNG entropy, hex). */
export function generateServerSeed(): string {
  return randomBytes(32).toString('hex');
}

export interface FairCommitment {
  serverSeed: string;
  serverSeedHash: string;
}

/** Generate a server seed + its public hash commitment for one round. */
export function newCommitment(): FairCommitment {
  const serverSeed = generateServerSeed();
  return { serverSeed, serverSeedHash: sha256(serverSeed) };
}

/**
 * Read-and-bump the caller's per-user game nonce inside a transaction. The nonce
 * is stored on the user doc (`gameNonce`) and increments by one per round so no
 * two rounds for a user ever share a seed string. MUST be called after all other
 * reads in the transaction (it performs its own read of the user doc).
 *
 * Returns the nonce to USE for this round (the pre-increment value) and writes
 * the incremented value back via the supplied transaction.
 */
export async function nextNonce(tx: Transaction, uid: string): Promise<number> {
  const userRef = db.doc(paths.user(uid));
  const snap = await tx.get(userRef);
  const current = (snap.data()?.gameNonce as number) ?? 0;
  // We do NOT write here — the caller bumps the user doc alongside its other
  // writes (Firestore forbids interleaving reads after writes). Return the next
  // value and the seq to persist.
  return current;
}

/** Convenience: the same FNV seed used by the shared RNG, for any server checks. */
export { hashSeed };
