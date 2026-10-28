import { describe, expect, it } from 'vitest';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { BASELINE, budgetFor, formatBalance, formatChange } from './budget';

describe('budget', () => {
  it('starts from the Treasury forecast and adds each costed policy once', () => {
    const labour = PARTY_BY_ID.labour!;
    const cgt = labour.policies.find((p) => p.id === 'lab-cgt')!;
    const gp = labour.policies.find((p) => p.id === 'lab-gp-visits')!;
    const b = budgetFor([cgt, gp, cgt]);
    expect(b.baseline).toBe(BASELINE.balanceNZDm);
    expect(b.change).toBe(cgt.fiscalImpactNZDm! + gp.fiscalImpactNZDm!);
    expect(b.balance).toBe(BASELINE.balanceNZDm + b.change);
  });

  it('formats money for the meters', () => {
    expect(formatBalance(4000)).toBe('$4.0bn surplus');
    expect(formatBalance(-350)).toBe('$350m deficit');
    expect(formatChange(-13000)).toBe('-$13bn');
    expect(formatChange(560)).toBe('+$560m');
  });

  it('labels every costing, and links a source for party costings', () => {
    for (const policy of PARTIES.flatMap((p) => p.policies)) {
      expect(policy.fiscalImpactNZDm).not.toBeNull();
      expect(policy.fiscalBasis).toBeDefined();
      expect(policy.fiscalNote).toBeTruthy();
      if (policy.fiscalBasis === 'party') expect(policy.fiscalSourceUrl).toBeTruthy();
    }
  });
});
