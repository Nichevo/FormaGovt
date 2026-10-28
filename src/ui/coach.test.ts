import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { createGame, makeOffer } from '../engine/game';
import { tipFor } from './Coach';
import { loadHistory, saveRecord } from './history';

describe('coach tips', () => {
  it('starts by explaining the first offer, then follows the talks', () => {
    const seats = { national: 35, labour: 34, greens: 18, act: 12, nzfirst: 12, opportunity: 7, tpm: 4 };
    let g = createGame({ player: PARTY_BY_ID.labour!, parties: PARTIES, seats, majority: 62, totalSeats: 123, seed: 1 });
    expect(tipFor(g)).toMatch(/Start with a party close to you/);
    g = makeOffer(g, PARTIES, { partnerId: 'act', partnerPolicyIds: [], playerPolicyIds: ['lab-cgt'], portfolios: [], arrangement: 'coalition' });
    expect(tipFor(g)).not.toMatch(/Start with/);
  });
});

describe('play history without browser storage', () => {
  it('never throws and just stays empty', () => {
    expect(() =>
      saveRecord({
        id: 'x',
        at: new Date().toISOString(),
        playerId: 'labour',
        scenarioId: 'poll-average',
        scenarioLabel: 'Poll average',
        variance: 'off',
        seed: 1,
        outcome: 'won',
        score: 50,
        partners: [],
      }),
    ).not.toThrow();
    expect(loadHistory()).toEqual([]);
  });
});
