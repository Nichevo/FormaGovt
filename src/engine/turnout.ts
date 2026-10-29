import demographics from '../data/demographics-2026.json';
import type { SeatInput } from './seats';

/**
 * "Who votes?": splits a scenario's party vote across age and sex groups, lets the player
 * change who enrols and who turns out, and works out the new party vote. With no changes
 * it gives back the scenario's vote exactly.
 */

export const AGE_BANDS = ['18-24', '25-34', '35-49', '50-64', '65+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];
export type Sex = 'female' | 'male';

export interface Group {
  band: AgeBand;
  sex: Sex;
  eligible: number;
  /** Share of the eligible who are enrolled, 0 to 100. */
  enrolledPct: number;
  /** Share of the enrolled who vote, 0 to 100. */
  turnoutPct: number;
}

export const GROUPS = demographics.groups as Group[];
export const DEMOGRAPHICS = demographics;

/** How the extra voters a change brings out vote. */
export type NewVoters = 'group' | 'average' | { party: string; share: number };

export interface TurnoutSettings {
  /** Enrolled share by age band, 0 to 100, in AGE_BANDS order. */
  enrol: number[];
  /** Share of the enrolled who vote, by age band. */
  turnout: number[];
  /** Everyone newly enrolled votes, rather than at their age band's turnout. */
  newAllVote: boolean;
  newVoters: NewVoters;
}

/** Today's figures for a band (both sexes share them). */
function base(band: AgeBand): { enrol: number; turnout: number } {
  const g = GROUPS.filter((x) => x.band === band);
  const w = g.reduce((s, x) => s + x.eligible, 0);
  return {
    enrol: g.reduce((s, x) => s + x.enrolledPct * x.eligible, 0) / w,
    turnout: g.reduce((s, x) => s + x.turnoutPct * x.eligible, 0) / w,
  };
}

export function defaultTurnout(): TurnoutSettings {
  return {
    enrol: AGE_BANDS.map((b) => round1(base(b).enrol)),
    turnout: AGE_BANDS.map((b) => round1(base(b).turnout)),
    newAllVote: false,
    newVoters: 'group',
  };
}

export function isDefaultTurnout(t: TurnoutSettings | undefined): boolean {
  if (!t) return true;
  const d = defaultTurnout();
  return (
    t.enrol.every((v, i) => v === d.enrol[i]) &&
    t.turnout.every((v, i) => v === d.turnout[i]) &&
    !t.newAllVote
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Roy Morgan cell for a group: under 50 or 50 and over. */
function cellOf(g: Group): string {
  return `${g.sex}-${g.band === '50-64' || g.band === '65+' ? '50+' : '18-49'}`;
}

/** How much more (above 1) or less a group backs a party than voters overall, averaged over the lean polls. */
export function leanOf(g: Group, party: string): number {
  const cell = cellOf(g);
  const ratios = demographics.leanPolls
    .map((p) => {
      const overall = (p.overall as Record<string, number>)[party];
      const share = (p.cells as Record<string, Record<string, number>>)[cell]?.[party];
      return overall === undefined || share === undefined ? null : (share + 1) / (overall + 1);
    })
    .filter((r): r is number => r !== null);
  return ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 1;
}

export interface GroupVotes {
  group: Group;
  /** People who vote today. */
  voters: number;
  /** Share of the group's vote for each party, summing to 1. */
  shares: Record<string, number>;
}

/**
 * Splits a party vote across the groups so each group leans as the polls say and the
 * groups add back up to the given vote (iterative proportional fitting).
 */
export function splitVote(partyVote: Record<string, number>): GroupVotes[] {
  const total = Object.values(partyVote).reduce((s, v) => s + v, 0);
  const target = Object.fromEntries(Object.entries(partyVote).map(([p, v]) => [p, v / total]));
  const parties = Object.keys(target);
  const voters = GROUPS.map((g) => g.eligible * (g.enrolledPct / 100) * (g.turnoutPct / 100));
  const allVoters = voters.reduce((s, v) => s + v, 0);
  const factor: Record<string, number> = Object.fromEntries(parties.map((p) => [p, target[p]!]));
  let shares: Record<string, number>[] = [];
  for (let i = 0; i < 50; i++) {
    shares = GROUPS.map((g) => {
      const raw = Object.fromEntries(parties.map((p) => [p, factor[p]! * leanOf(g, p)]));
      const sum = Object.values(raw).reduce((s, v) => s + v, 0);
      return Object.fromEntries(parties.map((p) => [p, sum > 0 ? raw[p]! / sum : 0]));
    });
    for (const p of parties) {
      const got = shares.reduce((s, sh, gi) => s + sh[p]! * voters[gi]!, 0) / allVoters;
      if (got > 0) factor[p] = factor[p]! * (target[p]! / got);
    }
  }
  return GROUPS.map((group, gi) => ({ group, voters: voters[gi]!, shares: shares[gi]! }));
}

export interface GroupChange {
  group: Group;
  enrolled: number;
  voters: number;
  baseVoters: number;
  unenrolled: number;
}

/** Enrolled and voting numbers for every group under the settings. */
export function groupsUnder(t: TurnoutSettings): GroupChange[] {
  return GROUPS.map((g) => {
    const i = AGE_BANDS.indexOf(g.band);
    // The band's change applies on top of each sex's own figure.
    const b = base(g.band);
    const enrolPct = clamp(g.enrolledPct + (t.enrol[i]! - b.enrol));
    const turnoutPct = clamp(g.turnoutPct + (t.turnout[i]! - b.turnout));
    const nowEnrolled = g.eligible * (g.enrolledPct / 100);
    const enrolled = g.eligible * (enrolPct / 100);
    const added = Math.max(0, enrolled - nowEnrolled);
    const voters = (enrolled - added) * (turnoutPct / 100) + added * (t.newAllVote ? 1 : turnoutPct / 100);
    return {
      group: g,
      enrolled,
      voters,
      baseVoters: nowEnrolled * (g.turnoutPct / 100),
      unenrolled: g.eligible - enrolled,
    };
  });
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** The scenario's party vote with the turnout changes applied, as percentages. */
export function applyTurnout<T extends SeatInput>(input: T, t: TurnoutSettings | undefined): T {
  if (!t || isDefaultTurnout(t)) return input;
  const split = splitVote(input.partyVote);
  const changes = groupsUnder(t);
  const votes: Record<string, number> = Object.fromEntries(Object.keys(input.partyVote).map((p) => [p, 0]));
  split.forEach((gv, i) => {
    const extra = changes[i]!.voters - gv.voters;
    const newShares = extra > 0 ? sharesForNew(gv.shares, input.partyVote, t.newVoters) : gv.shares;
    for (const p of Object.keys(votes)) votes[p] = votes[p]! + gv.voters * gv.shares[p]! + extra * newShares[p]!;
  });
  const total = Object.values(votes).reduce((s, v) => s + v, 0);
  return { ...input, partyVote: Object.fromEntries(Object.entries(votes).map(([p, v]) => [p, (Math.max(0, v) / total) * 100])) };
}

function sharesForNew(group: Record<string, number>, partyVote: Record<string, number>, mode: NewVoters): Record<string, number> {
  if (mode === 'group') return group;
  const total = Object.values(partyVote).reduce((s, v) => s + v, 0);
  const average = Object.fromEntries(Object.entries(partyVote).map(([p, v]) => [p, v / total]));
  if (mode === 'average') return average;
  // A share goes to the chosen party; the rest vote like others their age.
  return Object.fromEntries(
    Object.keys(group).map((p) => [p, (p === mode.party ? mode.share : 0) + (1 - mode.share) * group[p]!]),
  );
}

/** Compact form for share links: "e69,89,94,97,99;t74,70,74,81,85;n1;vg" (v: g, a, or party:share). */
export function encodeTurnout(t: TurnoutSettings): string {
  const v = t.newVoters === 'group' ? 'g' : t.newVoters === 'average' ? 'a' : `${t.newVoters.party}:${Math.round(t.newVoters.share * 100)}`;
  return `e${t.enrol.join(',')};t${t.turnout.join(',')};n${t.newAllVote ? 1 : 0};v${v}`;
}

export function decodeTurnout(s: string | null, partyIds: string[]): TurnoutSettings | undefined {
  if (!s) return undefined;
  const parts = Object.fromEntries(s.split(';').map((x) => [x[0], x.slice(1)]));
  const nums = (x: string | undefined) => (x ?? '').split(',').map(Number);
  const enrol = nums(parts.e);
  const turnout = nums(parts.t);
  const ok = (a: number[]) => a.length === AGE_BANDS.length && a.every((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  if (!ok(enrol) || !ok(turnout)) return undefined;
  let newVoters: NewVoters = 'group';
  if (parts.v === 'a') newVoters = 'average';
  else if (parts.v && parts.v !== 'g') {
    const [party, share] = parts.v.split(':');
    const n = Number(share);
    if (party && partyIds.includes(party) && Number.isFinite(n) && n >= 0 && n <= 100) newVoters = { party, share: n / 100 };
  }
  return { enrol, turnout, newAllVote: parts.n === '1', newVoters };
}

/** Quick settings for the "Who votes?" panel. */
export const TURNOUT_PRESETS: { id: string; label: string; apply: (t: TurnoutSettings) => TurnoutSettings }[] = [
  {
    id: 'unenrolled-vote',
    label: 'Everyone not enrolled enrols and votes',
    apply: (t) => ({ ...t, enrol: t.enrol.map(() => 100), newAllVote: true }),
  },
  {
    id: 'youth-surge',
    label: 'Youth surge: under-35s enrol and vote 15 points more',
    apply: (t) => ({
      ...t,
      enrol: t.enrol.map((v, i) => (i < 2 ? Math.min(100, round1(v + 15)) : v)),
      turnout: t.turnout.map((v, i) => (i < 2 ? Math.min(100, round1(v + 15)) : v)),
    }),
  },
  {
    id: 'everyone',
    label: 'Everyone eligible votes',
    apply: (t) => ({ ...t, enrol: t.enrol.map(() => 100), turnout: t.turnout.map(() => 100), newAllVote: true }),
  },
  { id: 'reset', label: 'Reset to today', apply: (t) => ({ ...defaultTurnout(), newVoters: t.newVoters }) },
];
