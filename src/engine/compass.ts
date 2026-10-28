import type { Issue, Policy } from '../data/schema';

/**
 * Two game axes built from policy stances, -2 to +2 each:
 * economic (left to right) and social (progressive to conservative).
 * These are the game's own ratings, not an official measure.
 */
const ECONOMIC: Issue[] = ['tax', 'kiwisaver-retirement', 'health', 'cost-of-living', 'housing'];
const SOCIAL: Issue[] = ['climate-environment', 'immigration', 'governance', 'treaty-maori', 'law-order'];

export interface CompassPoint {
  economic: number;
  social: number;
}

function axis(policies: Policy[], issues: Issue[]): number {
  const relevant = policies.filter((p) => issues.includes(p.issue));
  const weight = relevant.reduce((s, p) => s + p.weight, 0);
  return weight === 0 ? 0 : relevant.reduce((s, p) => s + p.stance * p.weight, 0) / weight;
}

export function compassPoint(policies: Policy[]): CompassPoint {
  return { economic: axis(policies, ECONOMIC), social: axis(policies, SOCIAL) };
}

/** How far the deal sits from where the party campaigned, on the same -2 to +2 scale. */
export function drift(from: CompassPoint, to: CompassPoint): number {
  return Math.hypot(to.economic - from.economic, to.social - from.social);
}

/** Within this distance of the manifesto, the party's voters stay comfortable. */
export const COMFORT_RADIUS = 0.6;
