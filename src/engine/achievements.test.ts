import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { createGame, makeOffer, waitDay } from './game';
import { eligiblePortfolios } from './negotiation';
import { earnedBy } from './achievements';

describe('achievements', () => {
  it('awards a first government and records the daily challenge', () => {
    const seats = { national: 35, labour: 34, greens: 18, act: 12, nzfirst: 12, opportunity: 7, tpm: 4 };
    let g = createGame({ player: PARTY_BY_ID.national!, parties: PARTIES, seats, majority: 62, totalSeats: 123, seed: 1 });
    g = makeOffer(g, PARTIES, {
      partnerId: 'labour',
      partnerPolicyIds: PARTY_BY_ID.labour!.policies.map((p) => p.id),
      playerPolicyIds: [],
      portfolios: eligiblePortfolios(PARTY_BY_ID.labour!).slice(0, 5),
      arrangement: 'coalition',
    });
    for (let i = 0; i < 3 && g.outcome === 'playing'; i++) g = waitDay(g, PARTIES);
    expect(g.outcome).toBe('won');
    const earned = earnedBy({ game: g, scenarioId: 'poll-average', daily: true, partiesWon: ['national'] });
    expect(earned).toEqual(expect.arrayContaining(['first-government', 'daily', 'grand-coalition']));
    expect(earned).not.toContain('every-party');
  });
});
