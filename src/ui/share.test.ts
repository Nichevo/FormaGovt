import { describe, expect, it } from 'vitest';
import { defaultTurnout } from '../engine/turnout';
import { challengeHash, parseChallenge } from './share';

describe('challenge links', () => {
  it('round-trips a challenge through the URL hash', () => {
    const c = {
      scenarioId: 'poll-average',
      variance: 'poll-error' as const,
      seed: 1234,
      playerId: 'greens',
      days: 21,
      rules: '1.2' as const,
      challenges: true,
      turnout: null,
      ease: 0,
    };
    expect(parseChallenge(challengeHash(c))).toEqual(c);
  });

  it('carries the Ease setting and the special votes variance', () => {
    const c = { scenarioId: 'result-2026-night', variance: 'special-votes' as const, seed: 7, days: 21, rules: '1.2' as const, challenges: false, turnout: null, ease: 3 };
    expect(challengeHash(c)).toContain('e=3');
    expect(parseChallenge(challengeHash(c))).toMatchObject({ variance: 'special-votes', ease: 3 });
    expect(parseChallenge('#play?s=poll-average&v=off&seed=1&e=9')!.ease).toBe(4);
  });

  it('carries "Who votes?" changes in the link', () => {
    const turnout = { ...defaultTurnout(), enrol: [100, 100, 100, 100, 100], newAllVote: true, newVoters: { party: 'greens', share: 0.5 } };
    const hash = challengeHash({ scenarioId: 'poll-average', variance: 'off', seed: 1, turnout });
    expect(parseChallenge(hash)?.turnout).toEqual(turnout);
    expect(challengeHash({ scenarioId: 'poll-average', variance: 'off', seed: 1, turnout: defaultTurnout() })).not.toContain('w=');
  });

  it('plays links from before v1.2 on the v1.1 rules', () => {
    const c = parseChallenge('#play?s=poll-average&v=off&seed=5&d=21');
    expect(c?.rules).toBe('1.1');
    expect(c?.challenges).toBe(false);
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
