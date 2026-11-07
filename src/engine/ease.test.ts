import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { SCENARIOS } from '../data/scenarios';
import { allocateSeats } from './seats';
import { createGame, contextFor } from './game';
import { acceptanceThreshold } from './negotiation';
import { applyVariance } from './variance';

const night = SCENARIOS.find((s) => s.id === 'result-2026-night')!;
const r = allocateSeats(night);
const base = { parties: PARTIES, seats: Object.fromEntries(r.parties.map((p) => [p.partyId, p.total])), majority: r.majority, totalSeats: r.totalSeats, seed: 1, rules: '1.2' as const };
const offer = { partnerId: 'act', partnerPolicyIds: [], playerPolicyIds: [], portfolios: [], arrangement: 'coalition' as const };

describe('Ease setting', () => {
  it('leaves the normal rules untouched at 0', () => {
    const g = createGame({ ...base, player: PARTY_BY_ID.national!, ease: 0 });
    expect(g.ease).toBeUndefined();
    expect(g).toEqual(createGame({ ...base, player: PARTY_BY_ID.national! }));
  });

  it('lowers the bar and raises trust for the player only', () => {
    const hard = createGame({ ...base, player: PARTY_BY_ID.national! });
    const easy = createGame({ ...base, player: PARTY_BY_ID.national!, ease: 4 });
    expect(easy.partners.act!.trust).toBeGreaterThan(hard.partners.act!.trust);
    const t = (g: typeof hard) => acceptanceThreshold({ ...contextFor(g, PARTIES, offer), trust: 50 }, 'coalition');
    expect(t(easy)).toBeCloseTo(t(hard) - 0.2, 6);
  });
});

describe('special votes variance', () => {
  it('is repeatable by seed and usually moves National down', () => {
    const a = applyVariance(night, { level: 'special-votes', seed: 5 });
    expect(applyVariance(night, { level: 'special-votes', seed: 5 })).toEqual(a);
    const share = (pv: Record<string, number>, id: string) => (pv[id]! / Object.values(pv).reduce((s, v) => s + v, 0)) * 100;
    const drops = Array.from({ length: 50 }, (_, i) => applyVariance(night, { level: 'special-votes', seed: i + 1 })).filter(
      (v) => share(v.partyVote, 'national') < share(night.partyVote, 'national'),
    ).length;
    expect(drops).toBeGreaterThan(40);
  });
});
