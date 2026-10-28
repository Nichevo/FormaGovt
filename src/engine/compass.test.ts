import { describe, expect, it } from 'vitest';
import { PARTY_BY_ID } from '../data/parties';
import { compassPoint, drift } from './compass';

describe('drift compass', () => {
  it('places parties on the expected sides of the economic axis', () => {
    expect(compassPoint(PARTY_BY_ID.act!.policies).economic).toBeGreaterThan(0);
    expect(compassPoint(PARTY_BY_ID.greens!.policies).economic).toBeLessThan(0);
  });

  it('measures drift as the distance between two points', () => {
    expect(drift({ economic: 0, social: 0 }, { economic: 0.3, social: 0.4 })).toBeCloseTo(0.5);
  });
});
