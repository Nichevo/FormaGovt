import { describe, it } from 'vitest';
import { PARTIES } from '../data/parties';
import { SCENARIOS } from '../data/scenarios';
import { allocateSeats } from './seats';
import { balanceRun, pairingMatrix, workable, type SimSetup } from './sim';
import type { BotStrategy } from './bot';
import type { RulesVersion } from './rules';

/** The full balance report. Slow, so it only runs with `npm run sim`. */
describe.runIf(process.env.SIM)('balance report', () => {
  const r = allocateSeats(SCENARIOS.find((s) => s.id === (process.env.SIM_SCENARIO ?? 'poll-average'))!);
  const base = { seats: Object.fromEntries(r.parties.map((p) => [p.partyId, p.total])), majority: r.majority, totalSeats: r.totalSeats };
  const seeds = Array.from({ length: Number(process.env.SIM_SEEDS ?? 10) }, (_, i) => i + 1);
  const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
  const runs: [string, RulesVersion, boolean, BotStrategy[]][] = [
    ['v1.1 normal', '1.1', false, ['closest', 'seats']],
    ['v1.2 normal, challenges off', '1.2', false, ['closest', 'seats']],
    ['v1.2 normal, challenges on', '1.2', true, ['closest', 'seats']],
    ['v1.1 give-away', '1.1', false, ['giveaway']],
    ['v1.2 give-away, challenges on', '1.2', true, ['giveaway']],
    ['v1.2 padding', '1.2', false, ['padding']],
  ];

  it('bot games', () => {
    const lines = ['| Run | Games | Won | Rival | Deadline | Caucus | Median score |', '| --- | --- | --- | --- | --- | --- | --- |'];
    for (const [label, rules, leadershipChallenges, strategies] of runs) {
      const res = balanceRun(PARTIES, { ...base, rules, leadershipChallenges }, strategies, seeds);
      lines.push(
        `| ${label} | ${res.games} | ${pct(res.won, res.games)} | ${pct(res.rival, res.games)} | ${pct(res.deadline, res.games)} | ${pct(res.caucus, res.games)} | ${res.medianScore} |`,
      );
      if (process.env.SIM_PER_PARTY) lines.push(`|  | ${Object.entries(res.perParty).map(([id, p]) => `${id} ${p.won}/${p.games}`).join(', ')} | | | | | |`);
    }
    console.log(lines.join('\n'));
  }, 1_200_000);

  it('pairings', () => {
    for (const rules of ['1.1', '1.2'] as RulesVersion[]) {
      const setup: SimSetup = { ...base, rules };
      const m = pairingMatrix(PARTIES, setup);
      const ids = Object.keys(m);
      let ok = 0;
      let total = 0;
      const lines = [`Pairings under v${rules} (your mood / their mood, * = workable)`, ['', ...ids].join('\t')];
      for (const a of ids) {
        lines.push(
          [
            a,
            ...ids.map((b) => {
              if (a === b) return '-';
              const d = m[a]![b]!;
              total++;
              if (workable(d)) ok++;
              return d ? `${d.playerMood}/${d.partnerMood}${workable(d) ? '*' : ''}` : 'none';
            }),
          ].join('\t'),
        );
      }
      lines.push(`Workable: ${ok} of ${total}`);
      console.log(lines.join('\n'));
    }
  }, 1_200_000);
});
