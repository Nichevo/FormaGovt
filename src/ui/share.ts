import type { VarianceLevel } from '../engine/variance';
import { isRulesVersion, type RulesVersion } from '../engine/rules';

/** Everything needed to replay the same election result and party. */
export interface Challenge {
  scenarioId: string;
  variance: Exclude<VarianceLevel, 'custom'>;
  seed: number;
  playerId?: string;
  /** Length of talks in days; links made before v1.1 have none and play the original ten. */
  days?: number;
  /** Rules version; links made before v1.2 have none and play v1.1. */
  rules?: RulesVersion;
  /** v1.2 leadership challenges setting. */
  challenges?: boolean;
  /** Set when this is today's daily challenge; never part of a link. */
  daily?: boolean;
}

const VARIANCES = ['off', 'poll-error', 'election-night'] as const;

/** Links shared before talks became three weeks long keep their ten days. */
const LEGACY_DAYS = 10;

export function challengeHash(c: Challenge): string {
  const params = new URLSearchParams({ s: c.scenarioId, v: c.variance, seed: String(c.seed) });
  if (c.playerId) params.set('p', c.playerId);
  if (c.days) params.set('d', String(c.days));
  if (c.rules && c.rules !== '1.1') params.set('r', c.rules);
  if (c.rules === '1.2' && c.challenges) params.set('c', '1');
  return `#play?${params.toString()}`;
}

export function challengeUrl(c: Challenge): string {
  return `${location.origin}${location.pathname}${challengeHash(c)}`;
}

/** Reads a challenge from a "#play?..." hash; anything malformed is ignored. */
export function parseChallenge(hash: string): Challenge | null {
  if (!hash.startsWith('#play?')) return null;
  const params = new URLSearchParams(hash.slice('#play?'.length));
  const scenarioId = params.get('s');
  const variance = params.get('v') as Challenge['variance'] | null;
  const seed = Number(params.get('seed'));
  if (!scenarioId || !variance || !VARIANCES.includes(variance) || !Number.isInteger(seed)) return null;
  const d = Number(params.get('d'));
  const days = Number.isInteger(d) && d >= 5 && d <= 30 ? d : LEGACY_DAYS;
  const r = params.get('r');
  const rules: RulesVersion = isRulesVersion(r) ? r : '1.1';
  return { scenarioId, variance, seed, playerId: params.get('p') ?? undefined, days, rules, challenges: rules === '1.2' && params.get('c') === '1' };
}

/** Uses the phone's share sheet where there is one, otherwise copies the link. */
export async function shareLink(url: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title: 'FormaGovt', text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    return 'failed';
  }
}
