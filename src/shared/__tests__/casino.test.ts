import {
  coinFlip,
  crashPoint,
  gameNet,
  gamePayout,
  hashSeed,
  resolveCrash,
  rng,
  scratchCard,
  seedString,
  spinSlots,
  spinWheel,
  WHEEL_SEGMENTS,
} from '../casino';

describe('provably-fair PRNG', () => {
  it('is deterministic for the same seed', () => {
    const a = rng('server:client:1');
    const b = rng('server:client:1');
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
  it('differs across nonces', () => {
    const s1 = seedString('srv', 'cli', 1);
    const s2 = seedString('srv', 'cli', 2);
    expect(rng(s1)()).not.toBe(rng(s2)());
  });
  it('produces values in [0,1)', () => {
    const next = rng('x');
    for (let i = 0; i < 1000; i++) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('hashSeed is stable', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});

describe('coin flip', () => {
  it('is deterministic and consistent', () => {
    const a = coinFlip('s:c:1', 'heads');
    const b = coinFlip('s:c:1', 'heads');
    expect(a).toEqual(b);
    expect(a.won).toBe(a.result === 'heads');
  });
  it('is roughly fair over many flips', () => {
    let heads = 0;
    for (let i = 0; i < 5000; i++) if (coinFlip(`s:c:${i}`, 'heads').result === 'heads') heads++;
    expect(heads).toBeGreaterThan(2000);
    expect(heads).toBeLessThan(3000);
  });
});

describe('slots', () => {
  it('is deterministic; 3 reels with a multiplier ≥ 0', () => {
    const r = spinSlots('s:c:7');
    expect(r.reels).toHaveLength(3);
    expect(r.multiplier).toBeGreaterThanOrEqual(0);
    expect(spinSlots('s:c:7')).toEqual(r);
  });
  it('has an RTP below 1 over many spins (house edge holds)', () => {
    let wagered = 0;
    let returned = 0;
    for (let i = 0; i < 20000; i++) {
      wagered += 100;
      returned += gamePayout(100, spinSlots(`x:y:${i}`).multiplier);
    }
    expect(returned / wagered).toBeLessThan(1);
  });
});

describe('wheel', () => {
  it('lands on a valid segment deterministically', () => {
    const r = spinWheel('s:c:3');
    expect(r.segmentIndex).toBeGreaterThanOrEqual(0);
    expect(r.segmentIndex).toBeLessThan(WHEEL_SEGMENTS.length);
    expect(r.multiplier).toBe(WHEEL_SEGMENTS[r.segmentIndex].mult);
  });
  it('RTP below 1', () => {
    let w = 0;
    let ret = 0;
    for (let i = 0; i < 20000; i++) {
      w += 100;
      ret += gamePayout(100, spinWheel(`a:b:${i}`).multiplier);
    }
    expect(ret / w).toBeLessThan(1);
  });
});

describe('scratch + crash', () => {
  it('scratch reveals 9 cells deterministically', () => {
    const r = scratchCard('s:c:9');
    expect(r.cells).toHaveLength(9);
    expect(r.multiplier).toBeGreaterThanOrEqual(0);
    expect(scratchCard('s:c:9')).toEqual(r);
  });
  it('crash point is ≥ 1 and respects cashout', () => {
    const cp = crashPoint('s:c:1');
    expect(cp).toBeGreaterThanOrEqual(1);
    const res = resolveCrash('s:c:1', 1.0); // cashing out at 1.00 always wins
    expect(res.won).toBe(true);
    const greedy = resolveCrash('s:c:1', 1000); // very greedy usually loses
    expect(greedy.won).toBe(greedy.crashAt >= 1000);
  });
});

describe('payout helpers', () => {
  it('gamePayout floors stake*mult and is never negative', () => {
    expect(gamePayout(100, 1.96)).toBe(196);
    expect(gamePayout(100, 0)).toBe(0);
    expect(gamePayout(33, 1.5)).toBe(49);
  });
  it('gameNet subtracts the stake', () => {
    expect(gameNet(100, 2)).toBe(100);
    expect(gameNet(100, 0)).toBe(-100);
  });
});
