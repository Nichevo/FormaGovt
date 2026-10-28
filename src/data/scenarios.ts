import pollData from './polls.json';
import electorates2026 from './electorates-2026.json';
import type { MarginalElectorate } from '../engine/variance';

export interface Poll {
  pollster: string;
  fieldwork: string;
  date: string;
  sourceUrl: string;
  partyVote: Record<string, number>;
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  sourceUrl?: string;
  partyVote: Record<string, number>;
  electorates: Record<string, number>;
  otherElectorates: number;
  marginalElectorates: MarginalElectorate[];
}

export const POLLS: Poll[] = pollData.polls;

/** Adds an "other" share so every poll sums to 100 and the 5% threshold is measured fairly. */
export function withOther(partyVote: Record<string, number>): Record<string, number> {
  const named = Object.values(partyVote).reduce((s, v) => s + v, 0);
  return { ...partyVote, other: Math.max(0, 100 - named) };
}

/** Simple average of each party's share across the given polls. */
export function averagePolls(polls: Poll[]): Record<string, number> {
  if (polls.length === 0) throw new Error('No polls to average');
  const ids = new Set(polls.flatMap((p) => Object.keys(p.partyVote)));
  return Object.fromEntries(
    [...ids].map((id) => [id, polls.reduce((s, p) => s + (p.partyVote[id] ?? 0), 0) / polls.length]),
  );
}

const assumedElectorates = {
  electorates: electorates2026.electorates as Record<string, number>,
  otherElectorates: electorates2026.otherElectorates,
  marginalElectorates: electorates2026.marginalElectorates,
};

const latest = POLLS[0]!;

export const SCENARIOS: Scenario[] = [
  {
    id: 'poll-average',
    label: `Poll average (${POLLS.length} polls)`,
    description: `Average of the ${POLLS.length} most recent public polls, ${POLLS.at(-1)!.date} to ${latest.date}.`,
    partyVote: withOther(averagePolls(POLLS)),
    ...assumedElectorates,
  },
  {
    id: 'latest-poll',
    label: `Latest poll: ${latest.pollster}`,
    description: `${latest.pollster}, fieldwork ${latest.fieldwork}.`,
    sourceUrl: latest.sourceUrl,
    partyVote: withOther(latest.partyVote),
    ...assumedElectorates,
  },
  {
    id: 'election-2023',
    label: '2023 election result',
    description: 'Official 2023 party votes and electorate wins, before the Port Waikato by-election.',
    sourceUrl: 'https://en.wikipedia.org/wiki/2023_New_Zealand_general_election',
    partyVote: {
      national: 1_085_016,
      labour: 767_236,
      greens: 330_883,
      act: 246_409,
      nzfirst: 173_425,
      tpm: 87_937,
    },
    electorates: { national: 43, labour: 17, greens: 3, act: 2, tpm: 6 },
    otherElectorates: 0,
    marginalElectorates: [],
  },
];
