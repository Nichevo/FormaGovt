import { PARTIES } from '../data/parties';
import { loadHistory, type PlayRecord } from './history';
import { readJson, writeJson } from './storage';

const KEY = 'formagovt.achievements';

/** Achievement id to the ISO date it was first earned, including any the play history shows were earned. */
export function loadAchievements(): Record<string, string> {
  const stored = readJson<unknown>(KEY, {});
  const saved = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, string>) : {};
  return { ...fromHistory(loadHistory()), ...saved };
}

/**
 * Achievements a play history proves, so games finished before an achievement was
 * recorded (or on an older version) still count. Only what a record holds can be checked.
 */
export function fromHistory(records: PlayRecord[]): Record<string, string> {
  const earned: Record<string, string> = {};
  const add = (id: string, at: string) => {
    if (!earned[id] || at < earned[id]!) earned[id] = at;
  };
  const won = new Set<string>();
  // Oldest first, so "every party" is dated by the game that completed the set.
  for (const r of [...records].sort((a, b) => a.at.localeCompare(b.at))) {
    if (r.daily) add('daily', r.at);
    if (r.outcome !== 'won') continue;
    add('first-government', r.at);
    if (r.score >= 80) add('high-score', r.at);
    if (r.scenarioId === 'election-2017') add('history', r.at);
    won.add(r.playerId);
    if (PARTIES.every((p) => won.has(p.id))) add('every-party', r.at);
  }
  return earned;
}

/** Records new achievements and returns the ids that are new this time. */
export function unlock(ids: string[]): string[] {
  const current = loadAchievements();
  const fresh = ids.filter((id) => !current[id]);
  if (fresh.length) {
    const now = new Date().toISOString();
    writeJson(KEY, { ...current, ...Object.fromEntries(fresh.map((id) => [id, now])) });
  }
  return fresh;
}
