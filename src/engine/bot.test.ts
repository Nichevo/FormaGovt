import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { SCENARIOS } from '../data/scenarios';
import { allocateSeats } from './seats';
import { playBot, rateDifficulty } from './bot';

const result = allocateSeats(SCENARIOS[0]!);
const setup = {
  seats: Object.fromEntries(result.parties.map((p) => [p.partyId, p.total])),
  majority: result.majority,
  totalSeats: result.totalSeats,
};

describe('bot player', () => {
  it('always finishes a game', () => {
    for (const party of PARTIES) {
      const run = playBot(party, PARTIES, { ...setup, seed: 5 });
      expect(run.game.outcome).not.toBe('playing');
    }
  });

  it('rates every seated party', () => {
    const ratings = rateDifficulty(PARTIES, setup);
    for (const id of Object.keys(setup.seats).filter((id) => setup.seats[id]! > 0 && PARTY_BY_ID[id])) {
      expect(['easy', 'medium', 'hard']).toContain(ratings[id]);
    }
  });
});
