import { useState } from 'react';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import type { SeatResult } from '../engine/seats';
import {
  AGE_BANDS,
  DEMOGRAPHICS,
  groupsUnder,
  isDefaultTurnout,
  TURNOUT_PRESETS,
  votesByGroup,
  type GroupChange,
  type TurnoutSettings,
} from '../engine/turnout';
import { Explain } from './Explain';

const fmt = (n: number) => Math.round(n).toLocaleString('en-NZ');
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

/** "Who votes?": a population pyramid with enrolment and turnout the player can change. */
export function WhoVotes({
  value,
  onChange,
  partyVote,
  before,
  after,
  locked,
}: {
  value: TurnoutSettings;
  /** The scenario's party vote before any turnout change. */
  partyVote: Record<string, number>;
  onChange: (t: TurnoutSettings) => void;
  /** Seats with nobody's turnout changed. */
  before: SeatResult;
  /** Seats with the changes. */
  after: SeatResult;
  /** Today's challenge plays everyone the same result. */
  locked?: boolean;
}) {
  const groups = groupsUnder(value);
  const widest = Math.max(...groups.map((g) => g.group.eligible));
  const voters = groups.reduce((s, g) => s + g.voters, 0);
  const extra = voters - groups.reduce((s, g) => s + g.baseVoters, 0);
  const unenrolled = groups.reduce((s, g) => s + g.unenrolled, 0);
  const changed = !isDefaultTurnout(value);
  const mode = typeof value.newVoters === 'object' ? 'party' : value.newVoters;
  const lean = typeof value.newVoters === 'object' ? value.newVoters : { party: 'greens', share: 0.5 };
  const setBand = (key: 'enrol' | 'turnout', i: number, v: number) =>
    onChange({ ...value, [key]: value[key].map((x, j) => (j === i ? v : x)) });

  return (
    <details className="who-votes" open={changed}>
      <summary>
        Who votes? Change enrolment and turnout by age{changed ? ' (changed)' : ''}{' '}
        <Explain topic="who-votes" label="who votes" />
      </summary>
      {locked ? (
        <p className="muted">Today's challenge plays everyone the same result, so turnout can't be changed.</p>
      ) : (
        <>
          <p className="muted small">
            {fmt(DEMOGRAPHICS.eligibleTotal)} people can vote; {fmt(DEMOGRAPHICS.eligibleTotal - DEMOGRAPHICS.enrolledTotal)} of
            them were not enrolled on {new Date(DEMOGRAPHICS.asOf).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' })}.
            Each group's vote leans the way recent polls show it does, and the result matches the poll until you change something.
          </p>
          <div className="pyramids">
          <div className="pyramid" role="img" aria-label="Population by age and sex: voted, enrolled but not voting, not enrolled">
            <h4>Who can vote</h4>
            <div className="pyramid-head">
              <span>Women</span>
              <span />
              <span>Men</span>
            </div>
            {[...AGE_BANDS].reverse().map((band) => {
              const row = groups.filter((g) => g.group.band === band);
              const bar = (sex: 'female' | 'male') => {
                const g = row.find((x) => x.group.sex === sex)!;
                const pct = (n: number) => `${(n / widest) * 100}%`;
                return (
                  <div
                    className={`pyramid-bar ${sex}`}
                    title={`${sex === 'female' ? 'Women' : 'Men'} ${band}: ${fmt(g.voters)} vote, ${fmt(g.enrolled - g.voters)} enrolled but don't vote, ${fmt(g.unenrolled)} not enrolled`}
                  >
                    <span className="voted" style={{ width: pct(g.voters) }} />
                    <span className="enrolled" style={{ width: pct(g.enrolled - g.voters) }} />
                    <span className="unenrolled" style={{ width: pct(g.unenrolled) }} />
                  </div>
                );
              };
              return (
                <div className="pyramid-row" key={band}>
                  {bar('female')}
                  <span className="pyramid-age">{band}</span>
                  {bar('male')}
                </div>
              );
            })}
            <div className="pyramid-legend small">
              <span>
                <i className="voted" /> Vote
              </span>
              <span>
                <i className="enrolled" /> Enrolled, don't vote
              </span>
              <span>
                <i className="unenrolled" /> Not enrolled
              </span>
            </div>
          </div>
          <PartyPyramid partyVote={partyVote} value={value} groups={groups} widest={widest} />
          </div>

          <div className="preset-buttons">
            {TURNOUT_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => onChange(p.apply(value))}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="band-sliders">
            {AGE_BANDS.map((band, i) => (
              <fieldset key={band}>
                <legend>{band}</legend>
                <label>
                  Enrolled {value.enrol[i]!.toFixed(0)}%
                  <input type="range" min={0} max={100} step={1} value={value.enrol[i]} onChange={(e) => setBand('enrol', i, Number(e.target.value))} />
                </label>
                <label>
                  Of those, vote {value.turnout[i]!.toFixed(0)}%
                  <input type="range" min={0} max={100} step={1} value={value.turnout[i]} onChange={(e) => setBand('turnout', i, Number(e.target.value))} />
                </label>
              </fieldset>
            ))}
          </div>

          <label className="check">
            <input type="checkbox" checked={value.newAllVote} onChange={(e) => onChange({ ...value, newAllVote: e.target.checked })} />
            <span>Everyone newly enrolled votes (otherwise they vote at their age group's rate)</span>
          </label>

          <div className="controls">
            <label>
              Extra voters vote
              <select
                value={mode}
                onChange={(e) =>
                  onChange({
                    ...value,
                    newVoters: e.target.value === 'party' ? lean : (e.target.value as 'group' | 'average'),
                  })
                }
              >
                <option value="group">Like others their age and sex</option>
                <option value="average">Like voters overall</option>
                <option value="party">Mostly for one party</option>
              </select>
            </label>
            {mode === 'party' && (
              <>
                <label>
                  Party
                  <select value={lean.party} onChange={(e) => onChange({ ...value, newVoters: { ...lean, party: e.target.value } })}>
                    {PARTIES.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Share to that party
                  <select
                    value={String(Math.round(lean.share * 100))}
                    onChange={(e) => onChange({ ...value, newVoters: { ...lean, share: Number(e.target.value) / 100 } })}
                  >
                    {[25, 50, 75, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}%, the rest like their age group
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <p>
            <strong>{fmt(voters)}</strong> voters ({signed(extra / 1000, 0)}k on today's turnout), {fmt(unenrolled)} still not enrolled.
          </p>
          {changed && <ChangeTable before={before} after={after} />}
          <p className="muted small">
            Sources: <a href={DEMOGRAPHICS.sources.enrolment.url} target="_blank" rel="noreferrer">enrolment</a>,{' '}
            <a href={DEMOGRAPHICS.sources.turnout.url} target="_blank" rel="noreferrer">2023 turnout by age</a>,{' '}
            <a href={DEMOGRAPHICS.sources.population.url} target="_blank" rel="noreferrer">population by age and sex</a>,{' '}
            <a href={DEMOGRAPHICS.sources.leans.url} target="_blank" rel="noreferrer">party vote by age and sex</a> (Roy Morgan only splits
            age at 50, so the party mix changes there). Electorate seats stay as
            in the scenario. A game estimate, not a forecast.
          </p>
        </>
      )}
    </details>
  );
}

function ChangeTable({ before, after }: { before: SeatResult; after: SeatResult }) {
  const rows = after.parties
    .map((p) => {
      const b = before.parties.find((x) => x.partyId === p.partyId);
      return { id: p.partyId, vote: p.votePercent - (b?.votePercent ?? 0), seats: p.total - (b?.total ?? 0), total: p.total };
    })
    .filter((r) => Math.abs(r.vote) >= 0.05 || r.seats !== 0)
    .sort((a, b) => b.vote - a.vote);
  return (
    <table className="small who-votes-change">
      <thead>
        <tr>
          <th>Party</th>
          <th>Vote (pts)</th>
          <th>Seats</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <span className="swatch" style={{ background: PARTY_BY_ID[r.id]?.colour ?? '#9a9a9a' }} />
              {PARTY_BY_ID[r.id]?.name ?? 'Others'}
            </td>
            <td>{signed(r.vote, 1)}</td>
            <td>
              {r.total} ({r.seats === 0 ? 'same' : signed(r.seats)})
            </td>
          </tr>
        ))}
        {after.majority !== before.majority && (
          <tr>
            <td colSpan={3} className="muted">
              Majority now {after.majority} (was {before.majority}).
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Left to right, so the bars read the same way on both sides. */
const PARTY_ORDER = ['greens', 'tpm', 'labour', 'opportunity', 'nzfirst', 'national', 'act', 'other'];
const nameOf = (id: string) => PARTY_BY_ID[id]?.name ?? 'Others';
const shortOf = (id: string) => PARTY_BY_ID[id]?.shortName ?? 'Oth';
const colourOf = (id: string) => PARTY_BY_ID[id]?.colour ?? '#9a9a9a';

/** Party vote by age and sex: the voters from the first pyramid, split by who they vote for. */
function PartyPyramid({
  partyVote,
  value,
  groups,
  widest,
}: {
  partyVote: Record<string, number>;
  value: TurnoutSettings;
  groups: GroupChange[];
  widest: number;
}) {
  const [mode, setMode] = useState<'votes' | 'share'>('share');
  const byGroup = votesByGroup(partyVote, value);
  const parties = PARTY_ORDER.filter((p) => p in partyVote).concat(Object.keys(partyVote).filter((p) => !PARTY_ORDER.includes(p)));
  const rowOf = (band: string, sex: 'female' | 'male') => {
    const i = groups.findIndex((g) => g.group.band === band && g.group.sex === sex);
    const votes = byGroup[i]!.votes;
    const total = Object.values(votes).reduce((s, v) => s + v, 0);
    return { votes, total };
  };
  const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);
  const sexName = (sex: 'female' | 'male') => (sex === 'female' ? 'Women' : 'Men');

  return (
    <div className="pyramid party-pyramid">
      <h4>How they vote</h4>
      <div className="pyramid-head">
        <span>Women</span>
        <span />
        <span>Men</span>
      </div>
      <div role="img" aria-label="Party vote by age and sex. The table below has the figures.">
        {[...AGE_BANDS].reverse().map((band) => {
          const bar = (sex: 'female' | 'male') => {
            const { votes, total } = rowOf(band, sex);
            const scale = mode === 'votes' ? total / widest : 1;
            return (
              <div className={`pyramid-bar ${sex}`}>
                {parties.map((p) =>
                  votes[p]! > 0 ? (
                    <span
                      key={p}
                      style={{ width: `${(votes[p]! / total) * scale * 100}%`, background: colourOf(p) }}
                      title={`${sexName(sex)} ${band}: ${nameOf(p)} ${pct(votes[p]!, total).toFixed(0)}% (${fmt(votes[p]!)} votes)`}
                    />
                  ) : null,
                )}
              </div>
            );
          };
          return (
            <div className="pyramid-row" key={band}>
              {bar('female')}
              <span className="pyramid-age">{band}</span>
              {bar('male')}
            </div>
          );
        })}
      </div>
      <div className="pyramid-legend small">
        {parties.map((p) => (
          <span key={p}>
            <i style={{ background: colourOf(p) }} /> {nameOf(p)}
          </span>
        ))}
      </div>
      <div className="pyramid-mode small">
        <label>
          <input type="radio" name="pyramid-mode" checked={mode === 'share'} onChange={() => setMode('share')} /> Share of each group
        </label>
        <label>
          <input type="radio" name="pyramid-mode" checked={mode === 'votes'} onChange={() => setMode('votes')} /> Number of votes
        </label>
      </div>
      <details className="small">
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table className="who-votes-change">
            <thead>
              <tr>
                <th>Group</th>
                {parties.map((p) => (
                  <th key={p} title={nameOf(p)}>
                    {shortOf(p)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AGE_BANDS.flatMap((band) =>
                (['female', 'male'] as const).map((sex) => {
                  const { votes, total } = rowOf(band, sex);
                  return (
                    <tr key={`${band}-${sex}`}>
                      <td>
                        {sexName(sex)} {band}
                      </td>
                      {parties.map((p) => (
                        <td key={p}>{pct(votes[p]!, total).toFixed(0)}%</td>
                      ))}
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
