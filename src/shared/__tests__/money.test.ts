import {
  apportion,
  applyRake,
  assertChips,
  MoneyError,
  previewPayout,
  refundAll,
  settlePariMutuel,
  settleWinnerTakeAll,
  verifyConservation,
} from '../money';

describe('assertChips', () => {
  it('accepts non-negative integers', () => {
    expect(assertChips(0)).toBe(0);
    expect(assertChips(1000)).toBe(1000);
  });
  it('rejects negatives, floats, and unsafe ints', () => {
    expect(() => assertChips(-1)).toThrow(MoneyError);
    expect(() => assertChips(1.5)).toThrow(MoneyError);
    expect(() => assertChips(Number.MAX_SAFE_INTEGER + 10)).toThrow(MoneyError);
  });
});

describe('applyRake', () => {
  it('takes zero rake at 0 bps', () => {
    expect(applyRake(1000, 0)).toEqual({ rake: 0, net: 1000 });
  });
  it('floors the rake so the house never over-takes', () => {
    // 333 * 250bps = 8.325 -> floor 8
    expect(applyRake(333, 250)).toEqual({ rake: 8, net: 325 });
  });
  it('rejects out-of-range bps', () => {
    expect(() => applyRake(100, -1)).toThrow(MoneyError);
    expect(() => applyRake(100, 10_001)).toThrow(MoneyError);
  });
});

describe('apportion (largest remainder)', () => {
  it('distributes exactly with no chip lost', () => {
    const r = apportion(100, [
      { uid: 'a', weight: 1 },
      { uid: 'b', weight: 1 },
      { uid: 'c', weight: 1 },
    ]);
    const total = [...r.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
    // 33,33,34 in some order — remainder chip goes to deterministic winner
    expect([...r.values()].sort()).toEqual([33, 33, 34]);
  });
  it('is proportional to weight', () => {
    const r = apportion(1000, [
      { uid: 'big', weight: 75 },
      { uid: 'small', weight: 25 },
    ]);
    expect(r.get('big')).toBe(750);
    expect(r.get('small')).toBe(250);
  });
  it('is deterministic for ties (uid tiebreak)', () => {
    const a = apportion(10, [
      { uid: 'zzz', weight: 1 },
      { uid: 'aaa', weight: 1 },
      { uid: 'mmm', weight: 1 },
    ]);
    const b = apportion(10, [
      { uid: 'mmm', weight: 1 },
      { uid: 'aaa', weight: 1 },
      { uid: 'zzz', weight: 1 },
    ]);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    // leftover chip (10 = 3+3+3 + 1) goes to lexicographically-first 'aaa'
    expect(a.get('aaa')).toBe(4);
  });
});

describe('settlePariMutuel', () => {
  it('splits the pot pro-rata among winners', () => {
    const entries = [
      { uid: 'a', stake: 100, outcomeId: 'yes' },
      { uid: 'b', stake: 300, outcomeId: 'yes' },
      { uid: 'c', stake: 200, outcomeId: 'no' },
    ];
    const r = settlePariMutuel(entries, 'yes', 0);
    expect(r.pool).toBe(600);
    expect(r.rake).toBe(0);
    // a:b stake 100:300 -> 1:3 of 600 = 150 / 450
    expect(r.payouts.find((p) => p.uid === 'a')!.amount).toBe(150);
    expect(r.payouts.find((p) => p.uid === 'b')!.amount).toBe(450);
    expect(r.payouts.find((p) => p.uid === 'b')!.profit).toBe(150);
    expect(r.payoutTotal).toBe(600);
  });

  it('refunds everyone when the winning side had no backers', () => {
    const entries = [
      { uid: 'a', stake: 100, outcomeId: 'no' },
      { uid: 'b', stake: 100, outcomeId: 'no' },
    ];
    const r = settlePariMutuel(entries, 'yes', 0);
    expect(r.model).toBe('REFUND_ALL');
    expect(r.payouts.every((p) => p.amount === 100 && p.profit === 0)).toBe(true);
    expect(r.payoutTotal).toBe(200);
  });

  it('never creates or destroys a chip even with awkward ratios', () => {
    const entries = [
      { uid: 'a', stake: 7, outcomeId: 'x' },
      { uid: 'b', stake: 11, outcomeId: 'x' },
      { uid: 'c', stake: 13, outcomeId: 'x' },
      { uid: 'd', stake: 101, outcomeId: 'y' },
    ];
    const r = settlePariMutuel(entries, 'x', 250);
    expect(r.payoutTotal + r.rake).toBe(r.pool);
    expect(() => verifyConservation(r.pool, r.payoutTotal, r.rake)).not.toThrow();
  });
});

describe('settleWinnerTakeAll', () => {
  it('gives the whole net pool to the winning side', () => {
    const entries = [
      { uid: 'me', stake: 500, outcomeId: 'me' },
      { uid: 'dave', stake: 500, outcomeId: 'dave' },
    ];
    const r = settleWinnerTakeAll(entries, 'me', 0);
    expect(r.payouts.find((p) => p.uid === 'me')!.amount).toBe(1000);
    expect(r.payouts.find((p) => p.uid === 'me')!.profit).toBe(500);
    expect(r.model).toBe('WINNER_TAKE_ALL');
  });
});

describe('refundAll', () => {
  it('returns each stake exactly', () => {
    const r = refundAll([
      { uid: 'a', stake: 50 },
      { uid: 'b', stake: 75 },
    ]);
    expect(r.payoutTotal).toBe(125);
    expect(r.rake).toBe(0);
  });
});

describe('previewPayout', () => {
  it('estimates a multiplier above 1 when backing the minority side', () => {
    const pre = previewPayout({ yes: 1000, no: 100 }, 'no', 100, 0);
    // backing 'no' (underdog) should pay more than even
    expect(pre.impliedMultiplier).toBeGreaterThan(1);
    expect(pre.estPayout).toBeGreaterThan(100);
  });
  it('reflects pari-mutuel dilution: staking into a side lowers its multiplier', () => {
    // Balanced 500/500 book; staking 100 on "yes" makes it 600 of an 1100 pool.
    // Payout if yes wins = floor(1100 * 100/600) = 183.
    const pre = previewPayout({ yes: 500, no: 500 }, 'yes', 100, 0);
    expect(pre.estPayout).toBe(183);
    expect(pre.estProfit).toBe(83);
    // The underdog side pays more for the same stake.
    const under = previewPayout({ yes: 500, no: 500 }, 'no', 100, 0);
    expect(under.estPayout).toBe(183); // symmetric on a balanced book
  });
});

// Property-style fuzz: conservation must hold for many random books.
describe('conservation property (fuzz)', () => {
  it('holds across random pari-mutuel settlements', () => {
    const rng = mulberry32(1234567);
    for (let iter = 0; iter < 2000; iter++) {
      const n = 1 + Math.floor(rng() * 8);
      const outcomes = ['a', 'b', 'c'];
      const entries = Array.from({ length: n }, (_, i) => ({
        uid: `u${i}`,
        stake: 1 + Math.floor(rng() * 5000),
        outcomeId: outcomes[Math.floor(rng() * outcomes.length)],
      }));
      const winning = outcomes[Math.floor(rng() * outcomes.length)];
      const rakeBps = Math.floor(rng() * 500);
      const r = settlePariMutuel(entries, winning, rakeBps);
      expect(r.payoutTotal + r.rake).toBe(r.pool);
      // No payout exceeds the pool; none negative.
      for (const p of r.payouts) {
        expect(p.amount).toBeGreaterThanOrEqual(0);
        expect(p.amount).toBeLessThanOrEqual(r.pool);
      }
    }
  });
});

// Small deterministic PRNG so the fuzz test is reproducible (no Math.random reliance for seeds).
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
