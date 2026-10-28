import { useMemo, useState } from 'react';
import { allocateSeats } from '../engine/seats';
import { applyVariance, type VarianceLevel } from '../engine/variance';
import { randomSeed } from '../engine/random';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { SCENARIOS } from '../data/scenarios';
import { Hemicycle } from './Hemicycle';
import type { GameSetup } from './App';
import { Explain } from './Explain';

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

export function SetupScreen({ onStart }: { onStart: (setup: GameSetup) => void }) {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const [variance, setVariance] = useState<Exclude<VarianceLevel, 'custom'>>('off');
  const [seed, setSeed] = useState(() => randomSeed());
  const [playerId, setPlayerId] = useState<string | null>(null);

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const result = useMemo(
    () => allocateSeats(applyVariance(scenario, { level: variance, seed })),
    [scenario, variance, seed],
  );
  const ordered = [...result.parties].sort((a, b) => b.total - a.total);
  const byPosition = [...result.parties].sort((a, b) => leftRight(a.partyId) - leftRight(b.partyId));
  const seatsOf = (id: string) => result.parties.find((p) => p.partyId === id)?.total ?? 0;
  const canPlay = (id: string) => seatsOf(id) > 0;

  return (
    <>
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
                    <span className={`badge ${party.difficulty}`}>{party.difficulty}</span>
                  </div>
                  <div className="muted">
                    {seats} seats · {party.people.filter((p) => p.isKeyFigure).map((p) => p.name).join(', ')}
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
          <button
            type="button"
            className="primary"
            disabled={!playerId || !canPlay(playerId)}
            onClick={() =>
              playerId && onStart({ playerId, result, seed, scenarioLabel: scenario.label })
            }
          >
            {playerId ? `Start negotiating as ${PARTY_BY_ID[playerId]!.name}` : 'Pick a party to start'}
          </button>
        </div>
      </section>
    </>
  );
}
