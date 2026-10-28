import type { VarianceLevel } from '../engine/variance';

/** Everything needed to replay the same election result and party. */
export interface Challenge {
  scenarioId: string;
  variance: Exclude<VarianceLevel, 'custom'>;
  seed: number;
  playerId?: string;
}

const VARIANCES = ['off', 'poll-error', 'election-night'] as const;

export function challengeHash(c: Challenge): string {
  const params = new URLSearchParams({ s: c.scenarioId, v: c.variance, seed: String(c.seed) });
  if (c.playerId) params.set('p', c.playerId);
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
  return { scenarioId, variance, seed, playerId: params.get('p') ?? undefined };
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
