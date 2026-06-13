import {
  ACHIEVEMENTS,
  levelFromXp,
  levelUpReward,
  satisfiedAchievements,
  seasonRankReward,
  streakMilestoneReward,
  xpForLevel,
} from '../gamification';

describe('xp / levels', () => {
  it('level 1 needs 0 xp and is monotonic', () => {
    expect(xpForLevel(1)).toBe(0);
    let prev = -1;
    for (let l = 1; l <= 100; l++) {
      const x = xpForLevel(l);
      expect(x).toBeGreaterThanOrEqual(prev);
      prev = x;
    }
  });
  it('resolves total xp into a level with progress in [0,1]', () => {
    const r = levelFromXp(0);
    expect(r.level).toBe(1);
    expect(r.progress).toBeGreaterThanOrEqual(0);
    const mid = levelFromXp(xpForLevel(5) + 10);
    expect(mid.level).toBe(5);
    expect(mid.progress).toBeGreaterThan(0);
    expect(mid.progress).toBeLessThanOrEqual(1);
  });
  it('lands exactly on a level boundary', () => {
    const r = levelFromXp(xpForLevel(8));
    expect(r.level).toBe(8);
    expect(r.intoLevel).toBe(0);
  });
  it('rewards milestone levels more', () => {
    expect(levelUpReward(3)).toBe(100);
    expect(levelUpReward(5)).toBe(500);
    expect(levelUpReward(10)).toBe(1500);
    expect(levelUpReward(25)).toBe(5000);
  });
});

describe('streaks & seasons', () => {
  it('pays known streak milestones, nothing otherwise', () => {
    expect(streakMilestoneReward(7)).toBe(500);
    expect(streakMilestoneReward(30)).toBe(3000);
    expect(streakMilestoneReward(8)).toBe(0);
  });
  it('pays season rank rewards with a tail for ranks beyond the table', () => {
    expect(seasonRankReward(1)).toBe(10000);
    expect(seasonRankReward(10)).toBe(1000);
    expect(seasonRankReward(40)).toBe(500); // top-50 tail
    expect(seasonRankReward(500)).toBe(250); // participation
  });
});

describe('achievements', () => {
  it('every achievement has a unique key and positive reward', () => {
    const keys = new Set(ACHIEVEMENTS.map((a) => a.key));
    expect(keys.size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((a) => a.reward > 0 && a.threshold > 0)).toBe(true);
  });
  it('flags satisfied achievements from a stats snapshot', () => {
    const got = satisfiedAchievements({ winCount: 12, betsPlaced: 6, friendCount: 5 });
    expect(got).toContain('first_blood'); // win 1
    expect(got).toContain('on_a_roll'); // win 10
    expect(got).not.toContain('sharp'); // win 50
    expect(got).toContain('getting_started'); // place 5
    expect(got).toContain('social'); // 5 friends
  });
});
