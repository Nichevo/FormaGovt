import { useMemo, useState } from 'react';
import { allocateSeats } from '../engine/seats';
import { applyVariance, type VarianceLevel } from '../engine/variance';
import { randomSeed } from '../engine/random';
import { rateDifficulty } from '../engine/bot';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { SCENARIOS } from '../data/scenarios';
import { Hemicycle } from './Hemicycle';
import type { GameSetup } from './App';
import { Explain } from './Explain';
import { HistoryPanel } from './HistoryPanel';
import { AchievementsPanel } from './AchievementsPanel';
import { dailyChallenge } from '../engine/daily';
import { DEFAULT_DAYS, SHORT_DAYS } from '../engine/game';
import type { Challenge } from './share';
import { LATEST_RULES, RULES_LABELS, RULES_VERSIONS, type RulesVersion } from '../engine/rules';
import { applyTurnout, defaultTurnout, isDefaultTurnout, type TurnoutSettings } from '../engine/turnout';
import { WhoVotes } from './WhoVotes';

const VARIANCE_LABELS: Record<Exclude<VarianceLevel, 'custom'>, string> = {
  off: 'Off: use the scenario exactly',
  'poll-error': 'Poll error: shares move by about 2 points',
  'election-night': 'Election night: bigger swings and seat upsets',
};

/** Average stance across the policy groups, used to seat parties left to right. */
export function leftRight(partyId: string): number {
  const stances = Object.values(PARTY_BY_ID[partyId]?.issueStance ?? {});
  return stances.reduce((s, v) => s + v, 0) / Math.max(1, stances.length);
}

export function SetupScreen({
  initial,
  onStart,
  onReplay,
}: {
  /** A challenge link or replayed game to start from. */
  initial: Challenge | null;
  onStart: (setup: GameSetup) => void;
  onReplay: (challenge: Challenge) => void;
}) {
  const known = initial && SCENARIOS.some((s) => s.id === initial.scenarioId) ? initial : null;
  const [scenarioId, setScenarioId] = useState(known?.scenarioId ?? SCENARIOS[0]!.id);
  const [variance, setVariance] = useState<Exclude<VarianceLevel, 'custom'>>(known?.variance ?? 'off');
  const [seed, setSeed] = useState(() => known?.seed ?? randomSeed());
  const [short, setShort] = useState(known?.days === SHORT_DAYS);
  const days = short ? SHORT_DAYS : DEFAULT_DAYS;
  const [rules, setRules] = useState<RulesVersion>(known?.rules ?? LATEST_RULES);
  const [challenges, setChallenges] = useState(known ? !!known.challenges : true);
  const [turnout, setTurnout] = useState<TurnoutSettings>(() => known?.turnout ?? defaultTurnout());
  const [playerId, setPlayerId] = useState<string | null>(
    known?.playerId && PARTY_BY_ID[known.playerId] ? known.playerId : null,
  );

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const unchanged = useMemo(
    () => allocateSeats(applyVariance(scenario, { level: variance, seed })),
    [scenario, variance, seed],
  );
  // Turnout changes come first, then the same variance, so the seed still means the same swing.
  const result = useMemo(
    () => (isDefaultTurnout(turnout) ? unchanged : allocateSeats(applyVariance(applyTurnout(scenario, turnout), { level: variance, seed }))),
    [unchanged, scenario, turnout, variance, seed],
  );
  // Difficulty depends on the result, so rate it from test plays of this one.
  const difficulty = useMemo(
    () =>
      rateDifficulty(PARTIES, {
        seats: Object.fromEntries(result.parties.map((p) => [p.partyId, p.total])),
        majority: result.majority,
        totalSeats: result.totalSeats,
        days,
        rules,
      }),
    [result, days, rules],
  );
  const ordered = [...result.parties].sort((a, b) => b.total - a.total);
  const byPosition = [...result.parties].sort((a, b) => leftRight(a.partyId) - leftRight(b.partyId));
  const seatsOf = (id: string) => result.parties.find((p) => p.partyId === id)?.total ?? 0;
  const canPlay = (id: string) => seatsOf(id) > 0;

  return (
    <>
      {known?.daily ? (
        <section className="panel challenge-note">
          Today's challenge: everyone in New Zealand gets the same election-night result and party today. A new one starts
          at midnight.
        </section>
      ) : (
        known && (
          <section className="panel challenge-note">
            You are playing a shared setup: the same election result{known.playerId ? ' and party' : ''} as the person
            who sent it. Change anything you like.
          </section>
        )
      )}
      {!known?.daily && (
        <div className="start-row">
          <button
            type="button"
            onClick={() => {
              const pollAverage = SCENARIOS.find((s) => s.id === 'poll-average')!;
              const daily = dailyChallenge(PARTIES, (s) =>
                Object.fromEntries(
                  allocateSeats(applyVariance(pollAverage, { level: 'election-night', seed: s })).parties.map((p) => [
                    p.partyId,
                    p.total,
                  ]),
                ),
              );
              onReplay({ ...daily, days: DEFAULT_DAYS, rules: LATEST_RULES, challenges: true, daily: true });
            }}
          >
            Play today's challenge
          </button>
        </div>
      )}
      <section className="panel">
        <h2>1. Election result</h2>
        <div className="controls">
          <label>
            Seats from
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Variance
            <select value={variance} onChange={(e) => setVariance(e.target.value as typeof variance)}>
              {Object.entries(VARIANCE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {variance !== 'off' && (
            <button type="button" onClick={() => setSeed(randomSeed())}>
              Re-roll (seed {seed})
            </button>
          )}
        </div>
        <p className="muted">
          {scenario.description}{' '}
          {scenario.sourceUrl && (
            <a href={scenario.sourceUrl} target="_blank" rel="noreferrer">
              Source
            </a>
          )}
        </p>

        <WhoVotes value={turnout} onChange={setTurnout} partyVote={scenario.partyVote} before={unchanged} after={result} />

        <Hemicycle parties={byPosition} otherSeats={result.otherElectorates} totalSeats={result.totalSeats} />
        <p className="majority">
          {result.totalSeats} seats, so a government needs <strong>{result.majority}</strong>
          {result.overhang > 0 && ` (includes ${result.overhang} overhang)`}. <Explain topic="majority" label="majority" />
        </p>

        <table className="seats">
          <thead>
            <tr>
              <th>Party</th>
              <th>
                Vote <Explain topic="threshold" label="threshold" />
              </th>
              <th>Electorates</th>
              <th>
                Seats <Explain topic="sainte-lague" label="seat allocation" />
              </th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((p) => {
              const party = PARTY_BY_ID[p.partyId]!;
              return (
                <tr key={p.partyId} className={p.qualified ? '' : 'out'}>
                  <td>
                    <span className="swatch" style={{ background: party.colour }} />
                    {party.name}
                  </td>
                  <td>{p.votePercent.toFixed(1)}%</td>
                  <td>{p.electorates}</td>
                  <td>
                    {p.total}
                    {p.overhang > 0 && (
                      <span className="muted">
                        {' '}
                        (+{p.overhang} overhang <Explain topic="overhang" label="overhang" />)
                      </span>
                    )}
                    {!p.qualified && <span className="muted"> below 5%</span>}
                  </td>
                </tr>
              );
            })}
            {result.otherElectorates > 0 && (
              <tr>
                <td>
                  <span className="swatch" style={{ background: '#9a9a9a' }} />
                  Independent
                </td>
                <td></td>
                <td>{result.otherElectorates}</td>
                <td>{result.otherElectorates}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>2. Choose your party</h2>
        <p className="muted small">
          Difficulty is rated for this result by test plays: easy if a simple strategy usually forms a government, hard if
          it never does.
        </p>
        <ul className="party-grid">
          {PARTIES.map((party) => {
            const seats = seatsOf(party.id);
            const selected = playerId === party.id;
            return (
              <li key={party.id}>
                <button
                  type="button"
                  className={`party-card ${selected ? 'selected' : ''}`}
                  style={{ borderTopColor: party.colour }}
                  disabled={!canPlay(party.id)}
                  aria-pressed={selected}
                  onClick={() => setPlayerId(party.id)}
                >
                  <div className="party-head">
                    <strong>{party.name}</strong>
                    {difficulty[party.id] && (
                      <span className={`badge ${difficulty[party.id]}`}>{difficulty[party.id]}</span>
                    )}
                  </div>
                  <div className="muted">
                    {seats} seat{seats === 1 ? '' : 's'} · {party.people.filter((p) => p.isKeyFigure).map((p) => p.name).join(', ')}
                  </div>
                  <ul className="flagships">
                    {party.policies
                      .filter((p) => p.weight >= 5)
                      .map((p) => (
                        <li key={p.id}>
                          {p.isBottomLine ? '🔒 ' : '★ '}
                          {p.title}
                        </li>
                      ))}
                  </ul>
                  {!canPlay(party.id) && <div className="muted">No seats in this result</div>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="start-row">
          <label className="check">
            <input type="checkbox" checked={short} onChange={() => setShort(!short)} />
            <span>Short game ({SHORT_DAYS} days of talks instead of {DEFAULT_DAYS})</span>
          </label>
          <fieldset className="rules-picker">
            <legend>
              Rules <Explain topic="rules" label="rules versions" />
            </legend>
            {RULES_VERSIONS.map((v) => (
              <label key={v} className="check">
                <input type="radio" name="rules" checked={rules === v} onChange={() => setRules(v)} />
                <span>
                  <strong>{RULES_LABELS[v].label}</strong> <span className="muted small">{RULES_LABELS[v].detail}</span>
                </span>
              </label>
            ))}
            <label className="check">
              <input type="checkbox" disabled={rules !== '1.2'} checked={rules === '1.2' && challenges} onChange={() => setChallenges(!challenges)} />
              <span>
                Leadership challenges: if your voters stay unhappy, your caucus warns you, then may vote you out{' '}
                <Explain topic="leadership" label="leadership challenges" />
                {rules !== '1.2' && <span className="muted small"> (v1.2 rules only)</span>}
              </span>
            </label>
          </fieldset>
          <button
            type="button"
            className="primary"
            disabled={!playerId || !canPlay(playerId)}
            onClick={() =>
              playerId &&
              onStart({
                playerId,
                result,
                seed,
                scenarioId,
                variance,
                scenarioLabel: scenario.label,
                startedAt: Date.now(),
                days,
                rules,
                challenges: rules === '1.2' && challenges,
                turnout: isDefaultTurnout(turnout) ? null : turnout,
                // Still the daily game only if nothing was changed.
                daily:
                  !!known?.daily &&
                  known.seed === seed &&
                  known.variance === variance &&
                  known.scenarioId === scenarioId &&
                  known.playerId === playerId &&
                  !short &&
                  rules === LATEST_RULES &&
                  challenges &&
                  isDefaultTurnout(turnout),
              })
            }
          >
            {playerId ? `Start negotiating as ${PARTY_BY_ID[playerId]!.name}` : 'Pick a party to start'}
          </button>
        </div>
      </section>
      <HistoryPanel onReplay={onReplay} />
      <AchievementsPanel />
    </>
  );
}
