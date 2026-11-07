import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from './parties';
import { SCENARIOS, averagePolls, POLLS, CURRENT_RESULT_ID } from './scenarios';
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

describe('2026 election night result', () => {
  const night = SCENARIOS.find((s) => s.id === 'result-2026-night')!;
  const result = allocateSeats(night);
  const seats = Object.fromEntries(result.parties.map((p) => [p.partyId, p.total]));

  it('is offered first until the official result is in', () => {
    expect(SCENARIOS[0]!.id).toMatch(/^result-2026-/);
    expect(CURRENT_RESULT_ID).toBe(SCENARIOS[0]!.id);
  });

  it('reproduces the reported election-night Parliament', () => {
    // As reported at 90.6% counted: a 129-seat House, 65 for a majority,
    // National 41 electorates on an entitlement of 36, Te Pāti Māori 5 on 1.
    expect(result.totalSeats).toBe(129);
    expect(result.majority).toBe(65);
    const nat = result.parties.find((p) => p.partyId === 'national')!;
    expect([nat.entitlement, nat.total]).toEqual([36, 41]);
    const tpm = result.parties.find((p) => p.partyId === 'tpm')!;
    expect([tpm.entitlement, tpm.total]).toEqual([1, 5]);
    expect(seats.national! + seats.act! + seats.nzfirst!).toBe(66);
    expect(seats.labour! + seats.greens! + seats.tpm!).toBe(56);
    expect(seats.opportunity).toBe(7);
  });

  it('counts 71 electorates', () => {
    const won = Object.values(night.electorates).reduce((s, n) => s + n, 0) + night.otherElectorates;
    expect(won).toBe(71);
  });
});
