import {
  americanToDecimal,
  assertOdds,
  computeFill,
  impliedProbability,
  layerRiskFor,
  matchedPot,
  OddsError,
  refundMatch,
  settleMatch,
  toAmerican,
} from '../fixedodds';

describe('odds conversions', () => {
  it('implied probability is 1/decimal', () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5, 6);
    expect(impliedProbability(4)).toBeCloseTo(0.25, 6);
  });
  it('decimal → American', () => {
    expect(toAmerican(2)).toBe('+100');
    expect(toAmerican(3)).toBe('+200'); // 2:1
    expect(toAmerican(1.5)).toBe('-200');
  });
  it('American → decimal round-trips', () => {
    expect(americanToDecimal(100)).toBeCloseTo(2, 2);
    expect(americanToDecimal(200)).toBeCloseTo(3, 2);
    expect(americanToDecimal(-200)).toBeCloseTo(1.5, 2);
  });
  it('rejects out-of-range odds', () => {
    expect(() => assertOdds(1)).toThrow(OddsError);
    expect(() => assertOdds(1000)).toThrow(OddsError);
  });
});

describe('escrow math', () => {
  it('layer covers maker profit; ceil so never under-collateralized', () => {
    expect(layerRiskFor(100, 2)).toBe(100); // even money
    expect(layerRiskFor(100, 3)).toBe(200); // 2:1 → layer puts up 200
    expect(layerRiskFor(33, 1.5)).toBe(17); // ceil(16.5)
  });
  it('matched pot = maker stake × odds', () => {
    expect(matchedPot(100, 3)).toBe(300);
    expect(matchedPot(50, 2)).toBe(100);
  });
});

describe('fills (partial matching)', () => {
  it('full fill when budget covers the whole offer', () => {
    const f = computeFill(100, 3, 500)!;
    expect(f.backerStakeMatched).toBe(100);
    expect(f.layerRisk).toBe(200);
    expect(f.pot).toBe(300);
    expect(f.remainingAfter).toBe(0);
  });
  it('partial fill when budget is short', () => {
    // odds 3 → layer risk = 2×maker stake. budget 100 covers 50 of maker stake.
    const f = computeFill(100, 3, 100)!;
    expect(f.backerStakeMatched).toBe(50);
    expect(f.layerRisk).toBe(100);
    expect(f.pot).toBe(150);
    expect(f.remainingAfter).toBe(50);
  });
  it('returns null when budget buys no whole stake', () => {
    expect(computeFill(100, 3, 1)).toBeNull(); // need ≥2 to cover 1 maker chip at 2:1
    expect(computeFill(0, 2, 100)).toBeNull();
  });
});

describe('settlement conserves chips', () => {
  it('winner takes the whole pot; backer win', () => {
    const s = settleMatch(100, 3, true);
    expect(s.winner).toBe('backer');
    expect(s.payout).toBe(300);
    expect(s.pot).toBe(300);
    // conservation: pot in == backerStake + layerRisk
    expect(s.payout).toBe(100 + layerRiskFor(100, 3));
  });
  it('layer wins when the backed side loses', () => {
    const s = settleMatch(100, 3, false);
    expect(s.winner).toBe('layer');
    expect(s.payout).toBe(300);
  });
  it('refund returns each side exactly their escrow', () => {
    const r = refundMatch(100, 3);
    expect(r.backerRefund).toBe(100);
    expect(r.layerRefund).toBe(200);
    expect(r.backerRefund + r.layerRefund).toBe(matchedPot(100, 3));
  });
});

describe('fixed-odds conservation (fuzz)', () => {
  it('pot in == payout out across random matched pairs', () => {
    let x = 123456;
    const rng = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 3000; i++) {
      const stake = 1 + Math.floor(rng() * 5000);
      const odds = +(1.05 + rng() * 8).toFixed(2);
      const backerWon = rng() < 0.5;
      const s = settleMatch(stake, odds, backerWon);
      expect(s.payout).toBe(s.pot);
      expect(s.pot).toBe(stake + layerRiskFor(stake, odds));
    }
  });
});
