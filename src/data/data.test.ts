import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from './parties';
import { SCENARIOS, averagePolls, POLLS } from './scenarios';
import { allocateSeats } from '../engine/seats';

describe('party data', () => {
  it('has all seven parties', () => {
    expect(PARTIES.map((p) => p.id).sort()).toEqual(
      ['act', 'greens', 'labour', 'national', 'nzfirst', 'opportunity', 'tpm'].sort(),
    );
  });

  it.each(PARTIES)('$name has unique policy ids and 1 to 5 bottom lines', (party) => {
    const ids = party.policies.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const bottomLines = party.policies.filter((p) => p.isBottomLine);
    expect(bottomLines.length).toBeGreaterThanOrEqual(1);
    expect(bottomLines.length).toBeLessThanOrEqual(5);
    expect(bottomLines.every((p) => p.bottomLineBasis)).toBe(true);
  });

  it.each(PARTIES)('$name uses real names only for 1 to 4 key figures', (party) => {
    const keyFigures = party.people.filter((p) => p.isKeyFigure);
    expect(keyFigures.length).toBeGreaterThanOrEqual(1);
    expect(keyFigures.length).toBeLessThanOrEqual(4);
    expect(keyFigures.some((p) => p.skills.includes('leadership'))).toBe(true);
    // Placeholders are named by role and party, never as a person.
    for (const p of party.people.filter((p) => !p.isKeyFigure)) {
      expect(p.name.startsWith(party.name)).toBe(true);
    }
  });

  it.each(PARTIES)('$name has relationships with every other party', (party) => {
    const others = PARTIES.filter((p) => p.id !== party.id).map((p) => p.id).sort();
    expect(party.relationships.map((r) => r.partyId).sort()).toEqual(others);
  });

  it('treats NZ First ruling out Labour as a bias, not a ban', () => {
    const bias = PARTY_BY_ID.nzfirst!.relationships.find((r) => r.partyId === 'labour');
    expect(bias!.ruledOutBias).toBeGreaterThan(0);
    expect(bias!.ruledOutBias).toBeLessThan(1);
  });
});

describe('scenarios', () => {
  it('averages polls by party', () => {
    const avg = averagePolls(POLLS);
    expect(avg.national).toBeCloseTo((24.8 + 29 + 27.6 + 32 + 28.5 + 29 + 25.9 + 28 + 31) / 9, 6);
  });

  it.each(SCENARIOS)('$label produces a valid Parliament', (scenario) => {
    for (const id of Object.keys(scenario.partyVote).filter((id) => id !== 'other')) {
      expect(PARTY_BY_ID[id], id).toBeDefined();
    }
    const result = allocateSeats(scenario);
    expect(result.totalSeats).toBeGreaterThanOrEqual(120);
    const seated = result.parties.reduce((s, p) => s + p.total, 0) + result.otherElectorates;
    expect(seated).toBe(result.totalSeats);
  });
});
