import { describe, expect, it } from 'vitest';
import { PARTY_BY_ID } from '../data/parties';
import {
  bestPersonFor,
  compatibility,
  eligiblePortfolios,
  evaluateOffer,
  reactionTo,
  type NegotiationContext,
  type Offer,
} from './negotiation';

const party = (id: string) => PARTY_BY_ID[id]!;
const policy = (partyId: string, id: string) => party(partyId).policies.find((p) => p.id === id)!;

describe('reactionTo', () => {
  it('treats a clash with a bottom line as a red line', () => {
    expect(reactionTo(party('act'), policy('labour', 'lab-cgt'))).toBe(-2);
    expect(reactionTo(party('national'), policy('labour', 'lab-cgt'))).toBe(-2);
    expect(reactionTo(party('greens'), policy('nzfirst', 'nzf-paris-exit'))).toBe(-2);
  });

  it('lets like-minded parties support each other', () => {
    expect(reactionTo(party('greens'), policy('labour', 'lab-cgt'))).toBe(1);
    expect(reactionTo(party('labour'), policy('labour', 'lab-cgt'))).toBe(2);
  });

  it('separates opposing from a red line', () => {
    expect(reactionTo(party('nzfirst'), policy('labour', 'lab-cgt'))).toBe(-1);
    // A small business write-off is not a new tax, so it does not cross National's bottom line.
    expect(reactionTo(party('national'), policy('labour', 'lab-business-writeoff'))).toBeGreaterThan(-2);
    expect(reactionTo(party('labour'), policy('national', 'nat-investment-boost'))).toBeGreaterThan(-2);
  });
});

describe('portfolios', () => {
  it('only offers roles a party has someone skilled for', () => {
    expect(eligiblePortfolios(party('nzfirst'))).toContain('foreign-affairs');
    expect(eligiblePortfolios(party('opportunity'))).not.toContain('foreign-affairs');
    expect(bestPersonFor(party('national'), 'finance')?.name).toBe('Nicola Willis');
  });
});

describe('evaluateOffer', () => {
  const ctx = (playerId: string, partnerId: string, pressure = 0): NegotiationContext => {
    const player = party(playerId);
    const partner = party(partnerId);
    const trust = partner.relationships.find((r) => r.partyId === playerId)!.trust;
    return { player, partner, trust, pressure };
  };
  const generous = (partnerId: string): Offer => ({
    partnerId,
    partnerPolicyIds: party(partnerId).policies.map((p) => p.id),
    playerPolicyIds: [],
    portfolios: eligiblePortfolios(party(partnerId)).slice(0, 2),
    arrangement: 'coalition',
  });

  it('walks away from a red line however generous the rest is', () => {
    const offer = { ...generous('act'), playerPolicyIds: ['lab-cgt'] };
    const response = evaluateOffer(offer, ctx('labour', 'act'));
    expect(response.kind).toBe('walk');
    expect(response.redLines.map((p) => p.id)).toEqual(['lab-cgt']);
  });

  it('asks for a missing bottom line first', () => {
    const offer = { ...generous('greens'), partnerPolicyIds: [] };
    const response = evaluateOffer(offer, ctx('labour', 'greens'));
    expect(response.kind).toBe('counter');
    expect(response.counter?.addPolicy?.isBottomLine).toBe(true);
  });

  it('accepts a generous offer from a natural partner', () => {
    expect(evaluateOffer(generous('greens'), ctx('labour', 'greens')).kind).toBe('accept');
  });

  it('judges the whole programme, including other partners’ policies', () => {
    const response = evaluateOffer(generous('opportunity'), {
      ...ctx('national', 'opportunity'),
      otherAgreed: [policy('nzfirst', 'nzf-paris-exit')],
    });
    expect(response.kind).toBe('walk');
  });

  it('treats a ruled-out partner as a bias that pressure wears down, not a ban', () => {
    const offer = generous('nzfirst');
    const early = evaluateOffer(offer, ctx('labour', 'nzfirst', 0));
    const late = evaluateOffer(offer, ctx('labour', 'nzfirst', 1));
    expect(late.utility).toBeGreaterThan(early.utility);
    expect(late.kind).toBe('accept');
  });

  it('asks less for confidence and supply', () => {
    const c = ctx('labour', 'greens');
    const base = { ...generous('greens'), portfolios: [] };
    const coalition = evaluateOffer({ ...base, arrangement: 'coalition' }, c);
    const support = evaluateOffer({ ...base, arrangement: 'confidence-supply' }, c);
    expect(support.threshold).toBeLessThan(coalition.threshold);
  });
});

describe('compatibility', () => {
  it('ranks natural partners above opponents', () => {
    expect(compatibility(party('labour'), party('greens'))).toBeGreaterThan(
      compatibility(party('labour'), party('act')),
    );
    expect(compatibility(party('national'), party('act'))).toBeGreaterThan(
      compatibility(party('national'), party('greens')),
    );
  });
});
