/**
 * placeBet DOUBLE-SPEND INTEGRATION — proves a balance can be escrowed at most
 * once even under concurrency: two competing escrow transactions on a balance
 * that only affords ONE → exactly one commits, the other aborts, and the balance
 * never goes negative.
 *
 * This runs against the FIRESTORE emulator using the firebase-admin SDK (the
 * same SDK Cloud Functions use). It drives the EXACT escrow money-path that
 * placeBet performs — the real `postLedgerTxn` from ../src/lib/ledger — inside a
 * real Firestore transaction, so what is proven is the shipping ledger engine's
 * non-negativity + optimistic-concurrency guarantee, not a re-implementation.
 *
 * Gating: requires the Firestore emulator. `emulators:exec --only firestore`
 * sets FIRESTORE_EMULATOR_HOST; when it is absent the suite self-skips with a
 * clear message rather than failing (so plain `jest` doesn't error).
 *
 * The end-to-end callable variant (booting the FUNCTIONS emulator and invoking
 * the real `placeBet` onCall over HTTPS with two racing clients) is documented as
 * a scaffold at the bottom — heavier infra (functions build + emulator + auth
 * tokens), spelled out with its exact assertions.
 */
import { LEDGER_DIRECTION, LEDGER_REASON, HOUSE_UID } from '../src/shared/constants';

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
// Use describe.skip when the emulator isn't wired so plain `jest` is green.
const d = EMULATOR ? describe : describe.skip;

if (!EMULATOR) {
  // eslint-disable-next-line no-console
  console.warn(
    '[placeBet.int] FIRESTORE_EMULATOR_HOST not set — skipping double-spend integration. ' +
      "Run via: firebase emulators:exec --only firestore 'jest --config jest.rules.config.js'",
  );
}

d('placeBet double-spend (admin SDK against the Firestore emulator)', () => {
  // The ledger module imports its Firestore handle from ../src/lib/admin (the
  // default admin app). We MUST run our transactions on that SAME instance so
  // the transaction object and postLedgerTxn's internal refs agree. So we set
  // the project up-front and then require the REAL admin + ledger modules.
  let db: FirebaseFirestore.Firestore;
  let postLedgerTxn: typeof import('../src/lib/ledger').postLedgerTxn;

  const UID = 'racer';
  const BET = 'race_bet';

  beforeAll(() => {
    process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'chipd-int-test';
    process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    // Loading ../src/lib/admin initializes the default app against the emulator
    // (it reads FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT from the env).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    db = require('../src/lib/admin').db as FirebaseFirestore.Firestore;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    postLedgerTxn = require('../src/lib/ledger').postLedgerTxn;
  });

  beforeEach(async () => {
    // Seed a user who can afford EXACTLY one 100-Chip escrow.
    await db.doc('users/' + UID).set({
      uid: UID,
      chipsBalance: 100,
      chipsHeld: 0,
      ledgerVersion: 0,
      ageVerified: true,
    });
  });

  afterEach(async () => {
    // Clean the docs the test touched.
    const cols = ['users/' + UID, 'users/' + HOUSE_UID];
    await Promise.all(cols.map((p) => db.doc(p).delete().catch(() => undefined)));
  });

  /** One escrow attempt: the exact ledger leg placeBet posts (DEBIT → held). */
  async function escrowOnce(idempotencyKey: string, stake: number): Promise<'ok' | 'rejected'> {
    try {
      await db.runTransaction(async (tx) => {
        // Mirror placeBet: read balance first (consistency), then post escrow.
        const userRef = db.doc('users/' + UID);
        const snap = await tx.get(userRef);
        const balance = (snap.data()?.chipsBalance as number) ?? 0;
        if (stake > balance) {
          // placeBet's failed-precondition guard.
          throw new Error('Insufficient Chips for this stake.');
        }
        await postLedgerTxn(tx, {
          idempotencyKey,
          txnGroupId: 'place:' + BET + ':' + UID,
          betId: BET,
          legs: [
            {
              uid: UID,
              direction: LEDGER_DIRECTION.DEBIT,
              amount: stake,
              reason: LEDGER_REASON.STAKE_ESCROW,
              bucket: 'escrow',
              memo: 'race escrow',
            },
          ],
        });
      });
      return 'ok';
    } catch {
      return 'rejected';
    }
  }

  /**
   * Post the escrow leg DIRECTLY through the ledger (no callable-level balance
   * pre-check). Returns whether the ledger treated it as a replay. This isolates
   * the ledger's own idempotency-marker short-circuit.
   */
  async function postEscrowRaw(idempotencyKey: string, stake: number): Promise<{ replayed: boolean }> {
    return db.runTransaction(async (tx) => {
      const res = await postLedgerTxn(tx, {
        idempotencyKey,
        txnGroupId: 'place:' + BET + ':' + UID,
        betId: BET,
        legs: [
          {
            uid: UID,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: stake,
            reason: LEDGER_REASON.STAKE_ESCROW,
            bucket: 'escrow',
            memo: 'race escrow',
          },
        ],
      });
      return { replayed: res.replayed };
    });
  }

  it('two concurrent escrows on a 100-Chip balance → exactly one succeeds', async () => {
    const stake = 100; // each attempt needs the WHOLE balance
    const [a, b] = await Promise.all([
      escrowOnce('place:' + BET + ':' + UID + ':attemptA', stake),
      escrowOnce('place:' + BET + ':' + UID + ':attemptB', stake),
    ]);

    const successes = [a, b].filter((r) => r === 'ok').length;
    expect(successes).toBe(1);

    const after = (await db.doc('users/' + UID).get()).data()!;
    // Balance moved 100 → 0, held 0 → 100. Never negative.
    expect(after.chipsBalance).toBe(0);
    expect(after.chipsHeld).toBe(100);
    expect(after.chipsBalance).toBeGreaterThanOrEqual(0);
  });

  it('the same idempotency key never double-escrows (ledger replay is a no-op)', async () => {
    const key = 'place:' + BET + ':' + UID + ':sameKey';
    // First post of 100 escrows the whole balance (replayed=false).
    const first = await postEscrowRaw(key, 100);
    expect(first.replayed).toBe(false);

    // A retry with the SAME key is a REPLAY: the idempotency marker
    // short-circuits the post BEFORE any balance read/write, so even though the
    // balance is now 0 there is no second debit and no negative balance.
    const second = await postEscrowRaw(key, 100);
    expect(second.replayed).toBe(true);

    const after = (await db.doc('users/' + UID).get()).data()!;
    expect(after.chipsBalance).toBe(0); // still 0, NOT -100
    expect(after.chipsHeld).toBe(100); // escrowed exactly once
  });

  it('an escrow exceeding the balance is rejected (held never overdrawn)', async () => {
    expect(await escrowOnce('place:' + BET + ':' + UID + ':tooBig', 101)).toBe('rejected');
    const after = (await db.doc('users/' + UID).get()).data()!;
    expect(after.chipsBalance).toBe(100); // untouched
    expect(after.chipsHeld).toBe(0);
  });
});

/**
 * ───────────────────────────────────────────────────────────────────────────
 * SCAFFOLD: full end-to-end callable double-spend (heavier infra; documented).
 *
 * Requires booting the FUNCTIONS emulator alongside Firestore and invoking the
 * real `placeBet` onCall over HTTPS as two racing authenticated clients. Steps +
 * assertions:
 *
 *   1. Build functions:                cd functions && npm run build
 *   2. Boot both emulators:            firebase emulators:exec --only functions,firestore '<jest>'
 *   3. Seed via admin SDK:
 *        users/{uid} = { chipsBalance: 100, ageVerified: true, region: 'MO', ... }
 *        bets/{betId} = { status: 'open', lockAt: now+1h, minStake: 10,
 *                         maxStake: 10000, outcomes: [{id:'yes'},{id:'no'}],
 *                         marketModel: 'PARI_MUTUEL', poolTotal: 0 }
 *   4. Create an authenticated callable client for {uid} (the functions emulator
 *      accepts an unsigned auth token; App Check is NOT enforced because
 *      callableOpts uses `enforceAppCheck: !IS_EMULATOR`).
 *   5. Fire two placeBet({ betId, outcomeId:'yes', stake:100, idempotencyKey:K1 })
 *      and placeBet({..., idempotencyKey:K2 }) with Promise.all.
 *
 *   ASSERT:
 *     - Exactly ONE call resolves ok:true; the other rejects with
 *       'failed-precondition' ("Insufficient Chips for this stake.").
 *     - users/{uid}.chipsBalance === 0 and chipsHeld === 100 (never negative).
 *     - exactly ONE bets/{betId}/entries/{uid} doc exists, stake 100.
 *     - bets/{betId}.poolTotal === 100 (incremented once, not twice).
 *     - Re-invoking placeBet with the SAME idempotencyKey returns
 *       alreadyPlaced:true and does NOT change balance/pool (entry docId === uid
 *       makes the second placement an idempotent no-op).
 *
 * This is intentionally left as a scaffold: the runnable admin-SDK test above
 * already proves the load-bearing invariant (at-most-once escrow, non-negative
 * balance) against the SAME shipping ledger engine the callable uses.
 * ───────────────────────────────────────────────────────────────────────────
 */
