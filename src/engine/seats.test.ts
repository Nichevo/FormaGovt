import { describe, expect, it } from 'vitest';
import { allocateSeats, sainteLague } from './seats';

describe('sainteLague', () => {
  it('splits seats in proportion to votes', () => {
    expect(sainteLague({ a: 53000, b: 24000, c: 23000 }, 7)).toEqual({ a: 3, b: 2, c: 2 });
  });
});

describe('allocateSeats', () => {
  // Official 2023 general election party votes and electorate wins (before the Port Waikato by-election).
  const election2023 = {
    partyVote: {
      national: 1_085_016,
      labour: 767_236,
      greens: 330_883,
      act: 246_409,
      nzfirst: 173_425,
      tpm: 87_937,
    },
    electorates: { national: 43, labour: 17, greens: 3, act: 2, tpm: 6 },
  };

  it('reproduces the official 2023 result', () => {
    const result = allocateSeats(election2023);
    const seats = Object.fromEntries(result.parties.map((p) => [p.partyId, p.total]));
    expect(seats).toEqual({ national: 48, labour: 34, greens: 15, act: 11, nzfirst: 8, tpm: 6 });
    expect(result.overhang).toBe(2);
    expect(result.totalSeats).toBe(122);
    expect(result.majority).toBe(62);
  });

  it('gives Te Pāti Māori its electorates as overhang despite a sub-5% vote', () => {
    const tpm = allocateSeats(election2023).parties.find((p) => p.partyId === 'tpm');
    expect(tpm).toMatchObject({ qualified: true, entitlement: 4, electorates: 6, overhang: 2 });
  });

  it('excludes a party under 5% with no electorate', () => {
    const result = allocateSeats({
      partyVote: { a: 60, b: 36, c: 4 },
      electorates: {},
    });
    const c = result.parties.find((p) => p.partyId === 'c');
    expect(c).toMatchObject({ qualified: false, total: 0 });
    expect(result.totalSeats).toBe(120);
    expect(result.majority).toBe(61);
  });

  it('counts the "other" vote towards the threshold but gives it no seats', () => {
    const result = allocateSeats({
      partyVote: { a: 50, b: 45, other: 5 },
      electorates: {},
    });
    expect(result.parties.map((p) => p.partyId)).toEqual(['a', 'b']);
    expect(result.parties.reduce((s, p) => s + p.total, 0)).toBe(120);
  });

  it('takes independent electorate seats out of the 120', () => {
    const result = allocateSeats({
      partyVote: { a: 50, b: 50 },
      electorates: {},
      otherElectorates: 2,
    });
    expect(result.parties.reduce((s, p) => s + p.total, 0)).toBe(118);
    expect(result.totalSeats).toBe(120);
  });
});
