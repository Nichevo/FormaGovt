import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../data/scenarios';
import { allocateSeats } from './seats';
import {
  AGE_BANDS,
  applyTurnout,
  decodeTurnout,
  defaultTurnout,
  encodeTurnout,
  groupsUnder,
  GROUPS,
  DEMOGRAPHICS,
  leanOf,
  splitVote,
  TURNOUT_PRESETS,
  type TurnoutSettings,
} from './turnout';

const pollAverage = SCENARIOS.find((s) => s.id === 'poll-average')!;
const preset = (id: string, t: TurnoutSettings = defaultTurnout()) => TURNOUT_PRESETS.find((p) => p.id === id)!.apply(t);
const share = (vote: Record<string, number>, p: string) => (vote[p]! / Object.values(vote).reduce((s, v) => s + v, 0)) * 100;

describe('who votes', () => {
  it('matches the Electoral Commission totals', () => {
    const eligible = GROUPS.reduce((s, g) => s + g.eligible, 0);
    const unenrolled = GROUPS.reduce((s, g) => s + g.eligible * (1 - g.enrolledPct / 100), 0);
    expect(eligible).toBe(DEMOGRAPHICS.eligibleTotal);
    expect(Math.abs(unenrolled - (DEMOGRAPHICS.eligibleTotal - DEMOGRAPHICS.enrolledTotal))).toBeLessThan(1000);
  });

  it('leans young women to the Greens and older men to National', () => {
    const youngWoman = GROUPS.find((g) => g.band === '18-24' && g.sex === 'female')!;
    const olderMan = GROUPS.find((g) => g.band === '65+' && g.sex === 'male')!;
    expect(leanOf(youngWoman, 'greens')).toBeGreaterThan(1.5);
    expect(leanOf(olderMan, 'national')).toBeGreaterThan(1.1);
    expect(leanOf(olderMan, 'other')).toBe(1);
  });

  it('splits the vote so the groups add back up to the poll', () => {
    const split = splitVote(pollAverage.partyVote);
    const all = split.reduce((s, g) => s + g.voters, 0);
    for (const p of Object.keys(pollAverage.partyVote)) {
      const got = (split.reduce((s, g) => s + g.voters * g.shares[p]!, 0) / all) * 100;
      expect(got, p).toBeCloseTo(share(pollAverage.partyVote, p), 6);
    }
  });

  it('leaves the result alone until something changes', () => {
    expect(applyTurnout(pollAverage, defaultTurnout())).toBe(pollAverage);
    expect(applyTurnout(pollAverage, undefined)).toBe(pollAverage);
  });

  it('brings out about 322,000 more voters when everyone not enrolled votes, and helps the Greens', () => {
    const t = preset('unenrolled-vote');
    const extra = groupsUnder(t).reduce((s, g) => s + g.voters - g.baseVoters, 0);
    expect(extra).toBeGreaterThan(315_000);
    expect(extra).toBeLessThan(330_000);
    const after = applyTurnout(pollAverage, t);
    expect(share(after.partyVote, 'greens')).toBeGreaterThan(share(pollAverage.partyVote, 'greens'));
    expect(share(after.partyVote, 'national')).toBeLessThan(share(pollAverage.partyVote, 'national'));
  });

  it('can send the new voters mostly to one party', () => {
    const t = { ...preset('unenrolled-vote'), newVoters: { party: 'greens', share: 0.6 } };
    const before = allocateSeats(pollAverage).parties.find((p) => p.partyId === 'greens')!.total;
    const after = allocateSeats(applyTurnout(pollAverage, t)).parties.find((p) => p.partyId === 'greens')!.total;
    expect(after).toBeGreaterThan(before + 2);
  });

  it('round-trips through a share link and rejects junk', () => {
    const t = { ...preset('youth-surge'), newVoters: { party: 'greens', share: 0.5 } };
    expect(decodeTurnout(encodeTurnout(t), ['greens'])).toEqual(t);
    expect(decodeTurnout('e1,2;t3', ['greens'])).toBeUndefined();
    expect(decodeTurnout(null, [])).toBeUndefined();
    expect(defaultTurnout().enrol).toHaveLength(AGE_BANDS.length);
  });
});
