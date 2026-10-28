import { readJson, writeJson } from './storage';

const KEY = 'formagovt.achievements';

/** Achievement id to the ISO date it was first earned. */
export function loadAchievements(): Record<string, string> {
  const stored = readJson<unknown>(KEY, {});
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, string>) : {};
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
