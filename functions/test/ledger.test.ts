/**
 * LEDGER / MONEY UNIT SUITE — proves the pure settlement math the server uses is
 * conservation-safe, never pays negative, and supports idempotent settlement.
 *
 * These import the REAL shared money module that settle.ts uses
 * (../src/shared/money), so what is proven here is exactly what ships. No
 * Firebase, no emulator — pure functions, exhaustive randomized property checks.
 *
 * The full ledger post (postLedgerTxn) requires a live Firestore transaction, so
 * its conservation guarantee is verified two ways:
 *   1) The pure settlement math below (settlePariMutuel/refundAll/...): the same
 *      result object settle.ts feeds into verifyConservation before posting.
 *   2) The idempotent-settlement CONTRACT is documented + asserted at the math
 *      level (REFUND_ALL determinism, conservation checksum), and the marker-doc
 *      mechanism is described in `describe('idempotent settlement contract')`.
 */
import {
  apportion,
  applyRake,
  refundAll,
  settlePariMutuel,
  settleWinnerTakeAll,
  verifyConservation,
  assertChips,
  previewPayout,
  MoneyError,
  type SettlementResult,
} from '../src/shared/money';

// ── deterministic PRNG (mulberry32) so failures are reproducible ──────────────
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Entry {
  uid: string;
  stake: number;
  outcomeId: string;
}

/** Build a random book of entries across `nOutcomes` outcomes. */
function randomBook(rand: () => number, nUsers: number, nOutcomes: number): Entry[] {
  const entries: Entry[] = [];
  for (let i = 0; i < nUsers; i++) {
    const stake = 1 + Math.floor(rand() * 5000); // [1, 5000]
    const outcomeId = 'o' + Math.floor(rand() * nOutcomes);
    entries.push({ uid: 'u' + i, stake, outcomeId });
  }
  return entries;
}

/** Assert the universal post-settlement invariants for ANY result. */
function assertResultInvariants(result: SettlementResult, entries: Entry[]): void {
  // Conservation: payouts + rake === pool, to the Chip.
  expect(result.payoutTotal + result.rake).toBe(result.pool);
  // Pool equals the sum of stakes.
  const stakeSum = entries.reduce((s, e) => s + e.stake, 0);
  expect(result.pool).toBe(stakeSum);
  // No negative payouts, all integers.
  for (const p of result.payouts) {
    expect(Number.isInteger(p.amount)).toBe(true);
    expect(p.amount).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(p.profit)).toBe(true);
  }
  // Rake is non-negative and never exceeds the pool.
  expect(result.rake).toBeGreaterThanOrEqual(0);
  expect(result.rake).toBeLessThanOrEqual(result.pool);
  // Payout sum matches the reported total.
  expect(result.payouts.reduce((s, p) => s + p.amount, 0)).toBe(result.payoutTotal);
  // verifyConservation must agree (it is what settle.ts calls before posting).
  expect(() => verifyConservation(result.pool, result.payoutTotal, result.rake)).not.toThrow();
}

describe('apportion — largest-remainder, no Chip lost', () => {
  it('distributes the exact total with zero rounding loss across random weights', () => {
    const rand = rng(1);
    for (let iter = 0; iter < 500; iter++) {
      const total = Math.floor(rand() * 100000);
      const n = 1 + Math.floor(rand() * 8);
      const weights = Array.from({ length: n }, (_, i) => ({
        uid: 'u' + i,
        weight: Math.floor(rand() * 1000),
      }));
      const shares = apportion(total, weights);
      const sum = [...shares.values()].reduce((s, v) => s + v, 0);
      expect(sum).toBe(total);
      for (const v of shares.values()) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic (same inputs → same map) for client/server agreement', () => {
    const w = [
      { uid: 'b', weight: 1 },
      { uid: 'a', weight: 1 },
      { uid: 'c', weight: 1 },
    ];
    const r1 = apportion(10, w);
    const r2 = apportion(10, w);
    expect([...r1.entries()].sort()).toEqual([...r2.entries()].sort());
    expect([...r1.values()].reduce((s, v) => s + v, 0)).toBe(10);
  });

  it('hands the whole amount to a deterministic entry when all weights are zero', () => {
    const shares = apportion(7, [
      { uid: 'b', weight: 0 },
      { uid: 'a', weight: 0 },
    ]);
    expect([...shares.values()].reduce((s, v) => s + v, 0)).toBe(7);
    // Tie broken by uid → 'a' gets it.
    expect(shares.get('a')).toBe(7);
    expect(shares.get('b')).toBe(0);
  });
});

describe('applyRake — floors, never over-takes', () => {
  it('rake + net === pool and rake is floored', () => {
    const rand = rng(2);
    for (let i = 0; i < 500; i++) {
      const pool = Math.floor(rand() * 1_000_000);
      const bps = Math.floor(rand() * 10_001);
      const { rake, net } = applyRake(pool, bps);
      expect(rake + net).toBe(pool);
      expect(rake).toBe(Math.floor((pool * bps) / 10_000));
      expect(rake).toBeLessThanOrEqual(pool);
    }
  });

  it('rejects out-of-range basis points', () => {
    expect(() => applyRake(100, -1)).toThrow(MoneyError);
    expect(() => applyRake(100, 10_001)).toThrow(MoneyError);
    expect(() => applyRake(100, 1.5)).toThrow(MoneyError);
  });
});

describe('settlePariMutuel — conservation across random books', () => {
  it('conserves Chips for thousands of random books and rakes', () => {
    const rand = rng(42);
    for (let iter = 0; iter < 3000; iter++) {
      const nUsers = 1 + Math.floor(rand() * 12);
      const nOutcomes = 2 + Math.floor(rand() * 3);
      const entries = randomBook(rand, nUsers, nOutcomes);
      const rakeBps = Math.floor(rand() * 1001); // [0, 1000] = up to 10%
      const winningOutcomeId = 'o' + Math.floor(rand() * nOutcomes);

      const result = settlePariMutuel(entries, winningOutcomeId, rakeBps);
      assertResultInvariants(result, entries);

      const winners = entries.filter((e) => e.outcomeId === winningOutcomeId);
      if (winners.length === 0) {
        // No winners → refund-all path: everyone gets exactly their stake, no rake.
        expect(result.model).toBe('REFUND_ALL');
        expect(result.rake).toBe(0);
        for (const e of entries) {
          const p = result.payouts.find((x) => x.uid === e.uid)!;
          expect(p.amount).toBe(e.stake);
        }
      } else {
        // Winners exist → only winners are paid; losers get nothing.
        expect(result.model).toBe('PARI_MUTUEL');
        const paidUids = new Set(result.payouts.map((p) => p.uid));
        for (const e of entries) {
          if (e.outcomeId !== winningOutcomeId) expect(paidUids.has(e.uid)).toBe(false);
        }
        // Total paid to winners == net pool (pool - rake).
        const { net } = applyRake(result.pool, rakeBps);
        expect(result.payoutTotal).toBe(net);
      }
    }
  });

  it('with zero rake (pilot config) winners split the whole pool', () => {
    const entries: Entry[] = [
      { uid: 'a', stake: 100, outcomeId: 'yes' },
      { uid: 'b', stake: 300, outcomeId: 'yes' },
      { uid: 'c', stake: 400, outcomeId: 'no' },
    ];
    const result = settlePariMutuel(entries, 'yes', 0);
    assertResultInvariants(result, entries);
    expect(result.payoutTotal).toBe(800); // whole pool to the 'yes' side
    const a = result.payouts.find((p) => p.uid === 'a')!;
    const b = result.payouts.find((p) => p.uid === 'b')!;
    // 100:300 split of 800 → 200 / 600.
    expect(a.amount).toBe(200);
    expect(b.amount).toBe(600);
    expect(a.profit).toBe(100);
    expect(b.profit).toBe(300);
  });

  it('a single winner takes the whole net pool', () => {
    const entries: Entry[] = [
      { uid: 'a', stake: 50, outcomeId: 'yes' },
      { uid: 'b', stake: 950, outcomeId: 'no' },
    ];
    const result = settlePariMutuel(entries, 'yes', 0);
    assertResultInvariants(result, entries);
    const a = result.payouts.find((p) => p.uid === 'a')!;
    expect(a.amount).toBe(1000);
    expect(a.profit).toBe(950);
  });
});

describe('settleWinnerTakeAll — same conservation, distinct model tag', () => {
  it('conserves and tags model correctly', () => {
    const rand = rng(7);
    for (let i = 0; i < 1000; i++) {
      const entries = randomBook(rand, 1 + Math.floor(rand() * 8), 2);
      const winningOutcomeId = 'o' + Math.floor(rand() * 2);
      const result = settleWinnerTakeAll(entries, winningOutcomeId, 0);
      assertResultInvariants(result, entries);
      const winners = entries.filter((e) => e.outcomeId === winningOutcomeId);
      expect(result.model).toBe(winners.length === 0 ? 'REFUND_ALL' : 'WINNER_TAKE_ALL');
    }
  });
});

describe('refundAll — voids return exact stakes', () => {
  it('refunds every participant their exact stake, zero rake, conserved', () => {
    const rand = rng(99);
    for (let i = 0; i < 1000; i++) {
      const entries = randomBook(rand, 1 + Math.floor(rand() * 15), 3);
      const result = refundAll(entries.map((e) => ({ uid: e.uid, stake: e.stake })));
      assertResultInvariants(result, entries);
      expect(result.rake).toBe(0);
      expect(result.model).toBe('REFUND_ALL');
      for (const e of entries) {
        const p = result.payouts.find((x) => x.uid === e.uid)!;
        expect(p.amount).toBe(e.stake);
        expect(p.profit).toBe(0);
      }
    }
  });

  it('refundAll on an empty book is a conserved no-op', () => {
    const result = refundAll([]);
    expect(result.pool).toBe(0);
    expect(result.payoutTotal).toBe(0);
    expect(result.payouts).toEqual([]);
  });
});

describe('no negative payouts, ever', () => {
  it('losers always receive exactly zero (never a negative balance effect)', () => {
    const rand = rng(123);
    for (let i = 0; i < 2000; i++) {
      const entries = randomBook(rand, 2 + Math.floor(rand() * 10), 2 + Math.floor(rand() * 3));
      const winningOutcomeId = 'o' + Math.floor(rand() * 4);
      const result = settlePariMutuel(entries, winningOutcomeId, Math.floor(rand() * 500));
      // Every payout is >= 0; a loser appears with no payout entry (treated as 0).
      for (const p of result.payouts) expect(p.amount).toBeGreaterThanOrEqual(0);
      // The ledger maps a missing payout to amount 0 (settle.ts: `payout?.amount ?? 0`),
      // and forfeits stake - 0 = stake from held. Confirm a loser's net is exactly
      // their forfeited stake (never an over-forfeit that would go negative).
      const winners = entries.filter((e) => e.outcomeId === winningOutcomeId);
      if (winners.length > 0) {
        for (const e of entries) {
          if (e.outcomeId === winningOutcomeId) continue;
          const p = result.payouts.find((x) => x.uid === e.uid);
          const amount = p?.amount ?? 0;
          const forfeit = e.stake - amount;
          expect(forfeit).toBe(e.stake); // loser forfeits exactly their stake
          expect(forfeit).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('verifyConservation — the abort gate settle.ts relies on', () => {
  it('throws if a single Chip would be created or destroyed', () => {
    expect(() => verifyConservation(100, 99, 0)).toThrow(MoneyError); // 1 destroyed
    expect(() => verifyConservation(100, 100, 1)).toThrow(MoneyError); // 1 created
    expect(() => verifyConservation(100, 100, 0)).not.toThrow();
    expect(() => verifyConservation(100, 90, 10)).not.toThrow();
  });
});

describe('assertChips — the non-negative-integer Chip guard', () => {
  it('rejects fractional, negative, and unsafe amounts; accepts valid Chips', () => {
    expect(() => assertChips(1.5)).toThrow(MoneyError);
    expect(() => assertChips(-1)).toThrow(MoneyError);
    expect(() => assertChips(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
    expect(assertChips(0)).toBe(0);
    expect(assertChips(1000)).toBe(1000);
  });
});

describe('previewPayout — client preview never claims more than settlement pays', () => {
  it('preview is conservative vs the authoritative settlement for the same book', () => {
    const rand = rng(2024);
    for (let i = 0; i < 1000; i++) {
      const poolByOutcome: Record<string, number> = {
        yes: Math.floor(rand() * 5000),
        no: Math.floor(rand() * 5000),
      };
      const myStake = 1 + Math.floor(rand() * 1000);
      const preview = previewPayout(poolByOutcome, 'yes', myStake, 0);
      // Build the equivalent settlement book and settle for 'yes'.
      const entries: Entry[] = [];
      for (const [outcomeId, amount] of Object.entries(poolByOutcome)) {
        if (amount > 0) entries.push({ uid: 'pool_' + outcomeId, stake: amount, outcomeId });
      }
      entries.push({ uid: 'me', stake: myStake, outcomeId: 'yes' });
      const result = settlePariMutuel(entries, 'yes', 0);
      const mine = result.payouts.find((p) => p.uid === 'me');
      const settledAmount = mine?.amount ?? 0;
      // Preview must not over-promise beyond what settlement actually pays + the
      // largest-remainder rounding slack (at most #winners Chips).
      const winners = entries.filter((e) => e.outcomeId === 'yes').length;
      expect(preview.estPayout).toBeLessThanOrEqual(settledAmount + winners);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENT SETTLEMENT CONTRACT (documented — the marker-doc approach).
//
// settle.ts guarantees exactly-once settlement via TWO fixed-id marker docs
// written INSIDE the same Firestore transaction as the payout:
//
//   1) bets/{betId}/settlement/result  — the immutable settlement result doc.
//      On entry, settle.ts reads it; if it exists, the whole transaction is a
//      no-op ({ settled: false }). So a retry never double-pays.
//
//   2) /idempotency/{key} with key `settle:{betId}` — written by postLedgerTxn.
//      Before posting legs, it reads the marker; if present, the ledger post is
//      replayed=true (no new entries, no balance change). So even a partial
//      retry that re-enters postLedgerTxn cannot double-credit.
//
// Because both markers share a deterministic id and are written transactionally,
// concurrent/retried settlements collapse to one. The pure math below is the
// payload those transactions write; its determinism is what makes the dedupe
// safe (a replay recomputes the identical result, so the stored doc never drifts).
// A live emulator-backed assertion of the double-settle no-op lives in
// settle.int.test.ts scaffolding (see placeBet.int.test.ts for the running
// emulator-integration pattern).
// ─────────────────────────────────────────────────────────────────────────────
describe('idempotent settlement contract (math determinism backing the dedupe)', () => {
  it('recomputing the same book yields a byte-identical result (safe to replay)', () => {
    const entries: Entry[] = [
      { uid: 'a', stake: 100, outcomeId: 'yes' },
      { uid: 'b', stake: 250, outcomeId: 'yes' },
      { uid: 'c', stake: 999, outcomeId: 'no' },
      { uid: 'd', stake: 1, outcomeId: 'no' },
    ];
    const r1 = settlePariMutuel(entries, 'yes', 0);
    const r2 = settlePariMutuel(entries, 'yes', 0);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('the stored checksum (payoutTotal + rake === pool) holds for the result doc', () => {
    const entries: Entry[] = [
      { uid: 'a', stake: 333, outcomeId: 'yes' },
      { uid: 'b', stake: 667, outcomeId: 'no' },
    ];
    const result = settlePariMutuel(entries, 'yes', 250); // 2.5% rake
    // This is exactly the `checksum` field settle.ts writes to settlement/result.
    expect(result.payoutTotal + result.rake === result.pool).toBe(true);
  });
});
