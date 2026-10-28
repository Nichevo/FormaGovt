import { readJson, writeJson } from './storage';
import type { Challenge } from './share';

export interface PlayRecord extends Required<Omit<Challenge, 'daily' | 'days'>> {
  id: string;
  /** Length of talks; games saved before v1.1 have none and were ten days. */
  days?: number;
  daily?: boolean;
  /** ISO time the game ended. */
  at: string;
  scenarioLabel: string;
  outcome: 'won' | 'lost';
  lostTo?: 'deadline' | 'rival';
  score: number;
  partners: string[];
}

const KEY = 'formagovt.history';
const LIMIT = 50;

export function loadHistory(): PlayRecord[] {
  const list = readJson<unknown>(KEY, []);
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** Saves a finished game once, newest first. */
export function saveRecord(record: PlayRecord): PlayRecord[] {
  const list = [record, ...loadHistory().filter((r) => r.id !== record.id)].slice(0, LIMIT);
  writeJson(KEY, list);
  return list;
}

export function clearHistory(): void {
  writeJson(KEY, []);
}

export function exportHistory(): void {
  const blob = new Blob([JSON.stringify(loadHistory(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'formagovt-history.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Merges records from an exported file, ignoring anything that is not a play record. */
export async function importHistory(file: File): Promise<PlayRecord[]> {
  const parsed: unknown = JSON.parse(await file.text());
  const incoming = Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  const byId = new Map([...loadHistory(), ...incoming].map((r) => [r.id, r]));
  const list = [...byId.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIMIT);
  writeJson(KEY, list);
  return list;
}

function isRecord(x: unknown): x is PlayRecord {
  const r = x as PlayRecord;
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof r.id === 'string' &&
    typeof r.at === 'string' &&
    typeof r.playerId === 'string' &&
    typeof r.scenarioId === 'string' &&
    typeof r.seed === 'number' &&
    typeof r.score === 'number' &&
    (r.outcome === 'won' || r.outcome === 'lost') &&
    Array.isArray(r.partners)
  );
}
