import {
  computeNets,
  computeSettlement,
  netImbalance,
  settleUp,
  totalBuyIn,
  tournamentPayouts,
  type PlayerLedger,
} from '../settleup';

describe('nets', () => {
  it('net = cashOut - buyIn', () => {
    const players: PlayerLedger[] = [
      { uid: 'a', buyIn: 100, cashOut: 250 },
      { uid: 'b', buyIn: 200, cashOut: 50 },
      { uid: 'c', buyIn: 100, cashOut: 100 },
    ];
    const nets = computeNets(players);
    expect(nets.find((n) => n.uid === 'a')!.net).toBe(150);
    expect(nets.find((n) => n.uid === 'b')!.net).toBe(-150);
    expect(nets.find((n) => n.uid === 'c')!.net).toBe(0);
  });
  it('a balanced cash game has zero imbalance', () => {
    const players: PlayerLedger[] = [
      { uid: 'a', buyIn: 100, cashOut: 250 },
      { uid: 'b', buyIn: 200, cashOut: 50 },
    ];
    expect(netImbalance(players)).toBe(0);
    expect(totalBuyIn(players)).toBe(300);
  });
  it('flags an imbalance (host typo) when cashouts don\'t match buy-ins', () => {
    const players: PlayerLedger[] = [
      { uid: 'a', buyIn: 100, cashOut: 250 },
      { uid: 'b', buyIn: 200, cashOut: 100 },
    ];
    expect(netImbalance(players)).toBe(50); // 50 extra cashed out
  });
});

describe('settle-up (minimal transfers)', () => {
  it('produces the fewest transfers to zero everyone', () => {
    // a +150, b -150 → one transfer b→a 150
    const t = settleUp([
      { uid: 'a', net: 150 },
      { uid: 'b', net: -150 },
    ]);
    expect(t).toEqual([{ from: 'b', to: 'a', amount: 150 }]);
  });
  it('handles a 4-player game with a clean reduction', () => {
    const nets = [
      { uid: 'a', net: 200 },
      { uid: 'b', net: -50 },
      { uid: 'c', net: -150 },
      { uid: 'd', net: 0 },
    ];
    const t = settleUp(nets);
    // total transferred == total owed (200)
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(200);
    // everyone ends at zero
    const bal: Record<string, number> = { a: 200, b: -50, c: -150, d: 0 };
    for (const x of t) {
      bal[x.from] += x.amount;
      bal[x.to] -= x.amount;
    }
    expect(Object.values(bal).every((v) => v === 0)).toBe(true);
    // minimal: 2 transfers (c→a 150, b→a 50)
    expect(t.length).toBeLessThanOrEqual(2);
  });
  it('is deterministic', () => {
    const nets = [
      { uid: 'z', net: 100 },
      { uid: 'y', net: 100 },
      { uid: 'x', net: -200 },
    ];
    expect(settleUp(nets)).toEqual(settleUp(nets));
  });
});

describe('computeSettlement', () => {
  it('only emits transfers when balanced', () => {
    const balanced = computeSettlement([
      { uid: 'a', buyIn: 100, cashOut: 250 },
      { uid: 'b', buyIn: 200, cashOut: 50 },
    ]);
    expect(balanced.balanced).toBe(true);
    expect(balanced.transfers.length).toBe(1);

    const off = computeSettlement([
      { uid: 'a', buyIn: 100, cashOut: 300 },
      { uid: 'b', buyIn: 200, cashOut: 50 },
    ]);
    expect(off.balanced).toBe(false);
    expect(off.transfers).toEqual([]);
  });
});

describe('tournament payouts', () => {
  it('pays a 2-player heads-up winner-take-all', () => {
    const p = tournamentPayouts(
      [
        { uid: 'a', place: 1 },
        { uid: 'b', place: 2 },
      ],
      200,
    );
    expect(p.find((x) => x.uid === 'a')!.amount).toBe(200);
    expect(p.find((x) => x.uid === 'b')).toBeUndefined();
  });
  it('pays top-3 for an 8-player field and conserves the pool', () => {
    const results = Array.from({ length: 8 }, (_, i) => ({ uid: `p${i}`, place: i + 1 }));
    const pool = 800;
    const payouts = tournamentPayouts(results, pool);
    expect(payouts.length).toBe(3); // top 3 paid
    expect(payouts.reduce((s, x) => s + x.amount, 0)).toBe(pool); // no chip lost
    // 1st > 2nd > 3rd
    expect(payouts[0].amount).toBeGreaterThan(payouts[1].amount);
    expect(payouts[1].amount).toBeGreaterThan(payouts[2].amount);
  });
});
