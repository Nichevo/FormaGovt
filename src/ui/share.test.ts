import { describe, expect, it } from 'vitest';
import { challengeHash, parseChallenge } from './share';

describe('challenge links', () => {
  it('round-trips a challenge through the URL hash', () => {
    const c = { scenarioId: 'poll-average', variance: 'poll-error' as const, seed: 1234, playerId: 'greens', days: 21 };
    expect(parseChallenge(challengeHash(c))).toEqual(c);
  });

  it('keeps links from before v1.1 at their original ten days', () => {
    expect(parseChallenge('#play?s=poll-average&v=off&seed=5')?.days).toBe(10);
  });

  it('ignores anything malformed', () => {
    expect(parseChallenge('#about')).toBeNull();
    expect(parseChallenge('#play?s=x&v=wild&seed=1')).toBeNull();
    expect(parseChallenge('#play?s=x&v=off&seed=abc')).toBeNull();
  });
});
