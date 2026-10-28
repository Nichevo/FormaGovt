import { describe, expect, it } from 'vitest';
import { applyVariance } from './variance';

const input = {
  partyVote: { a: 30, b: 28, c: 15, d: 10, e: 10, f: 6, other: 1 },
  electorates: { a: 40, b: 20, f: 1 },
  marginalElectorates: [{ seat: 'Example', holder: 'f', challenger: 'b', holdProbability: 0.5 }],
};

describe('applyVariance', () => {
  it('changes nothing when variance is off', () => {
    expect(applyVariance(input, { level: 'off', seed: 1 })).toBe(input);
  });

  it('is repeatable for the same seed', () => {
    const a = applyVariance(input, { level: 'poll-error', seed: 42 });
    const b = applyVariance(input, { level: 'poll-error', seed: 42 });
    expect(a).toEqual(b);
  });

  it('keeps vote shares summing to 100 and moves them by plausible amounts', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const out = applyVariance(input, { level: 'poll-error', seed });
      const total = Object.values(out.partyVote).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(100, 6);
      // 1.5 x sampling error for a 30% party is about 2.2 points; 5 sd is a generous ceiling.
      expect(Math.abs((out.partyVote.a ?? 0) - 30)).toBeLessThan(11);
    }
  });

  it('only flips marginal electorates on election night', () => {
    const pollError = Array.from({ length: 50 }, (_, s) => applyVariance(input, { level: 'poll-error', seed: s }));
    expect(pollError.every((o) => o.electorates.f === 1)).toBe(true);
    const night = Array.from({ length: 50 }, (_, s) => applyVariance(input, { level: 'election-night', seed: s }));
    expect(night.some((o) => o.electorates.f === 0 && o.electorates.b === 21)).toBe(true);
    expect(night.every((o) => (o.electorates.f ?? 0) + (o.electorates.b ?? 0) === 21)).toBe(true);
  });
});
