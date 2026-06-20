import {
  cost,
  liquidityForSeed,
  maxSubsidy,
  priceCents,
  priceYes,
  quoteBuy,
  quoteSell,
  SHARE_PAYOUT,
  type MarketState,
} from '../markets';

const fresh = (b = 1000): MarketState => ({ qYes: 0, qNo: 0, b });

describe('LMSR price', () => {
  it('is 50c on a fresh balanced market', () => {
    expect(priceYes(fresh())).toBeCloseTo(0.5, 6);
    expect(priceCents(fresh(), 'yes')).toBe(50);
    expect(priceCents(fresh(), 'no')).toBe(50);
  });
  it('rises for YES as YES shares are bought, and yes+no ~ 100c', () => {
    const s: MarketState = { qYes: 500, qNo: 0, b: 1000 };
    const py = priceCents(s, 'yes');
    const pn = priceCents(s, 'no');
    expect(py).toBeGreaterThan(50);
    expect(py + pn).toBeGreaterThanOrEqual(99);
    expect(py + pn).toBeLessThanOrEqual(101);
  });
  it('stays strictly between 1 and 99 cents even at extremes', () => {
    const s: MarketState = { qYes: 100000, qNo: 0, b: 1000 };
    expect(priceCents(s, 'yes')).toBeLessThanOrEqual(99);
    expect(priceCents(s, 'no')).toBeGreaterThanOrEqual(1);
  });
});

describe('quoteBuy', () => {
  it('returns whole shares and spends ~the budget', () => {
    const q = quoteBuy(fresh(), 'yes', 100);
    expect(Number.isInteger(q.shares)).toBe(true);
    expect(q.shares).toBeGreaterThan(0);
    expect(q.cost).toBeLessThanOrEqual(101);
    expect(q.cost).toBeGreaterThan(0);
    expect(q.potentialPayout).toBe(q.shares * SHARE_PAYOUT);
  });
  it('costs more per share as you buy more of one side (price impact)', () => {
    const small = quoteBuy(fresh(), 'yes', 50);
    const big = quoteBuy(fresh(), 'yes', 5000);
    expect(big.avgPriceCents).toBeGreaterThanOrEqual(small.avgPriceCents);
  });
  it('a tiny budget that buys no whole shares returns zero', () => {
    const q = quoteBuy({ qYes: 0, qNo: 0, b: 1_000_000 }, 'yes', 0);
    expect(q.shares).toBe(0);
    expect(q.cost).toBe(0);
  });
});

describe('quoteSell', () => {
  it('selling back what you bought returns roughly the cost (round-trip ≈ neutral)', () => {
    const s = fresh();
    const buy = quoteBuy(s, 'yes', 1000);
    const sell = quoteSell(buy.after, 'yes', buy.shares);
    // Round-trip should not profit the trader (AMM rounding favors the house).
    expect(sell.proceeds).toBeLessThanOrEqual(buy.cost);
    // …but should be close (within a few %).
    expect(sell.proceeds).toBeGreaterThan(buy.cost * 0.9);
  });
});

describe('subsidy / liquidity', () => {
  it('maxSubsidy is b*ln2 and liquidityForSeed inverts it', () => {
    expect(maxSubsidy(1000)).toBe(Math.ceil(1000 * Math.LN2));
    const b = liquidityForSeed(5000);
    expect(maxSubsidy(b)).toBeLessThanOrEqual(5001);
  });
  it('cost function is finite and increasing in shares', () => {
    expect(cost(fresh())).toBeGreaterThan(0);
    expect(cost({ qYes: 100, qNo: 0, b: 1000 })).toBeGreaterThan(cost(fresh()));
  });
});
