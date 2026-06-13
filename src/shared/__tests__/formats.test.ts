import {
  bracketRounds,
  insurancePayout,
  newSquaresGrid,
  parlayBusted,
  parlayHits,
  parlayMultiplier,
  parlayProgress,
  seedBracket,
  shuffledDigits,
  squaresIsFull,
  squaresWinningCell,
} from '../formats';

describe('parlays', () => {
  const legs = [
    { pickOutcomeId: 'a', resultOutcomeId: 'a' },
    { pickOutcomeId: 'yes', resultOutcomeId: 'yes' },
    { pickOutcomeId: 'home', resultOutcomeId: null },
  ];
  it('only hits when all legs hit', () => {
    expect(parlayHits(legs)).toBe(false); // one pending
    const all = legs.map((l) => ({ ...l, resultOutcomeId: l.pickOutcomeId }));
    expect(parlayHits(all)).toBe(true);
  });
  it('busts as soon as one leg misses', () => {
    const busted = [{ pickOutcomeId: 'a', resultOutcomeId: 'b' }, ...legs];
    expect(parlayBusted(busted)).toBe(true);
    expect(parlayBusted(legs)).toBe(false);
  });
  it('multiplies leg odds (default 2.0 each)', () => {
    expect(parlayMultiplier([{ pickOutcomeId: 'a' }, { pickOutcomeId: 'b' }])).toBe(4);
    expect(parlayMultiplier([{ pickOutcomeId: 'a', odds: 1.5 }, { pickOutcomeId: 'b', odds: 3 }])).toBe(4.5);
  });
  it('reports progress', () => {
    expect(parlayProgress(legs)).toEqual({ hit: 2, resolved: 2, total: 3 });
  });
});

describe('brackets', () => {
  it('computes rounds as ceil(log2(n))', () => {
    expect(bracketRounds(2)).toBe(1);
    expect(bracketRounds(4)).toBe(2);
    expect(bracketRounds(8)).toBe(3);
    expect(bracketRounds(5)).toBe(3); // padded to 8
  });
  it('seeds first round and auto-advances byes', () => {
    const m = seedBracket(['A', 'B', 'C']); // padded to 4 → one bye
    expect(m.length).toBe(2);
    // C vs (null) should auto-advance C
    const bye = m.find((x) => x.b.name == null || x.a.name == null);
    expect(bye?.winnerSlotId).toBeTruthy();
  });
});

describe('squares', () => {
  it('fills and detects full', () => {
    const g = newSquaresGrid(2, 100); // 2x2 = 4 cells
    expect(squaresIsFull(g)).toBe(false);
    g.cells = ['u1', 'u2', 'u3', 'u4'];
    expect(squaresIsFull(g)).toBe(true);
  });
  it('resolves the winning cell from header digits', () => {
    const g = newSquaresGrid(10, 100);
    g.rowDigits = shuffledDigits(42);
    g.colDigits = shuffledDigits(99);
    const cell = squaresWinningCell(g, 17, 24); // last digits 7 and 4
    expect(cell).not.toBeNull();
    const row = g.rowDigits.indexOf(7);
    const col = g.colDigits.indexOf(4);
    expect(cell).toBe(row * 10 + col);
  });
  it('shuffledDigits is a deterministic permutation of 0..9', () => {
    const a = shuffledDigits(7);
    const b = shuffledDigits(7);
    expect(a).toEqual(b); // deterministic
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('power-ups', () => {
  it('insurance refunds half the stake on a loss, nothing on a win', () => {
    expect(insurancePayout(300, false)).toBe(150);
    expect(insurancePayout(301, false)).toBe(150); // floor
    expect(insurancePayout(300, true)).toBe(0);
  });
});
