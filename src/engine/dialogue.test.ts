import { describe, expect, it } from 'vitest';
import { PARTIES } from '../data/parties';
import { speakerFor, lineFor } from './dialogue';
import type { LogEntry } from './game';

const KINDS: LogEntry['kind'][] = ['accept', 'counter', 'hold', 'walk', 'signed', 'rejected', 'ratifying'];

describe('dialogue', () => {
  it('never attributes a line to, or names, a real person', () => {
    const realNames = PARTIES.flatMap((p) => p.people.filter((m) => m.isKeyFigure).map((m) => m.name));
    for (const party of PARTIES) {
      const speaker = speakerFor(party);
      for (const kind of KINDS) {
        const text = `${speaker} ${lineFor({ day: 1, kind } as LogEntry, party)}`;
        for (const name of realNames) expect(text).not.toContain(name);
      }
    }
  });
});
