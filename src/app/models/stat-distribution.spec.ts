import { GrowthRates, STAT_KEYS, toGrowth } from './growth.models';
import { projectStats } from './recruitment.models';
import {
  addLevelUp,
  applyFloor,
  compareDistributions,
  levelUpChances,
  pointDistribution,
  projectDistributions,
  quantile,
  rankOf,
  summarize,
} from './stat-distribution';

const growthOf = (rates: Partial<GrowthRates>): GrowthRates => ({ ...toGrowth(null), ...rates });
const total = (probs: number[]) => probs.reduce((sum, value) => sum + value, 0);

describe('stat distributions', () => {
  it('is an exact binomial for independent level ups', () => {
    const { str } = projectDistributions(growthOf({ str: 5 }), 1, 11, { growthAt: () => growthOf({ str: 40 }) });
    const summary = summarize(str);

    expect(total(str.probs)).toBeCloseTo(1, 12);
    expect(summary.mean).toBeCloseTo(9, 12);
    expect(summary.sd).toBeCloseTo(Math.sqrt(10 * 0.4 * 0.6), 12);
    expect(str.min).toBe(5);
    expect(str.probs[0]).toBeCloseTo(0.6 ** 10, 12);
    expect(str.probs[10]).toBeCloseTo(0.4 ** 10, 12);
  });

  it('keeps the existing average projection when there is no guaranteed minimum', () => {
    const start = growthOf({ hp: 20, str: 6, mag: 3 });
    const growthAt = (level: number) => growthOf({ hp: 60, str: level < 20 ? 35 : 55, mag: 15 });
    const exact = projectDistributions(start, 4, 40, { growthAt });
    const average = projectStats(start, 4, 40, growthAt);

    for (const stat of STAT_KEYS) {
      expect(summarize(exact[stat]).mean).toBeCloseTo(average[stat], 10);
    }
  });

  it('always gives the hundreds of a growth rate over 100%, and never raises zero or negative growth', () => {
    const chances = levelUpChances(growthOf({ hp: 130, str: -10 }));

    expect(chances.hp).toEqual({ sure: 1, chance: jasmine.any(Number) });
    expect(chances.hp.chance).toBeCloseTo(0.3, 12);
    expect(chances.str).toEqual({ sure: 0, chance: 0 });
  });

  it('spreads the guaranteed minimum evenly over stats that could rise but did not', () => {
    // Two stats at 10%: with a minimum of 1, a level up with neither rising raises one of them.
    const one = levelUpChances(growthOf({ str: 10, mag: 10 }), 1);
    expect(one.str.chance).toBeCloseTo(0.1 + 0.9 * (0.9 * 0.5), 12);
    expect(one.hp.chance).toBe(0);

    // With a minimum of 2 and only two stats able to rise, both always do.
    const two = levelUpChances(growthOf({ str: 10, mag: 10 }), 2);
    expect(two.str.chance).toBeCloseTo(1, 12);
    expect(two.mag.chance).toBeCloseTo(1, 12);
  });

  it('meets the minimum on average: the expected number of risen stats is at least the minimum', () => {
    const growth = growthOf({ hp: 40, str: 30, mag: 5, spd: 30, dex: 25, def: 20, res: 10, lck: 25, cha: 20 });
    const chances = levelUpChances(growth, 2);
    const expected = STAT_KEYS.reduce((sum, stat) => sum + chances[stat].chance, 0);
    const independent = STAT_KEYS.reduce((sum, stat) => sum + growth[stat] / 100, 0);

    expect(expected).toBeGreaterThan(independent);
    expect(expected).toBeGreaterThanOrEqual(2);
  });

  it('raises values below a class floor to the floor on a reclass', () => {
    const floored = applyFloor(addLevelUp(addLevelUp(pointDistribution(8), { sure: 0, chance: 0.5 }), { sure: 0, chance: 0.5 }), 9);

    expect(floored.min).toBe(9);
    expect(floored.probs[0]).toBeCloseTo(0.75, 12);
    expect(floored.probs[1]).toBeCloseTo(0.25, 12);

    const { str } = projectDistributions(growthOf({ str: 2 }), 1, 3, {
      growthAt: () => growthOf({ str: 50 }),
      floorsAt: (level) => (level === 2 ? growthOf({ str: 10 }) : null),
    });
    expect(str.min).toBe(10);
    expect(summarize(str).mean).toBeCloseTo(10.5, 12);
  });

  it('reads percentiles, ranges and the rank of an actual value', () => {
    const { str } = projectDistributions(growthOf({ str: 0 }), 1, 3, { growthAt: () => growthOf({ str: 50 }) });
    // 0: 25%, 1: 50%, 2: 25%
    expect([0.1, 0.25, 0.26, 0.75, 0.76, 0.9].map((q) => quantile(str, q))).toEqual([0, 0, 1, 1, 2, 2]);

    const rank = rankOf(str, 2);
    expect(rank.below).toBeCloseTo(0.75, 12);
    expect(rank.equal).toBeCloseTo(0.25, 12);
    expect(rank.percentile).toBeCloseTo(87.5, 12);
    expect(rankOf(str, 5).equal).toBe(0);
  });

  it('gives the chance one build beats another, with ties, adding up to 100%', () => {
    const a = projectDistributions(growthOf({ str: 10 }), 1, 21, { growthAt: () => growthOf({ str: 45 }) }).str;
    const b = projectDistributions(growthOf({ str: 12 }), 1, 21, { growthAt: () => growthOf({ str: 30 }) }).str;
    const ab = compareDistributions(a, b);
    const ba = compareDistributions(b, a);

    expect(ab.win + ba.win + ab.tie).toBeCloseTo(1, 12);
    expect(ab.tie).toBeCloseTo(ba.tie, 12);
    expect(ab.win).toBeGreaterThan(ba.win);
  });
});
