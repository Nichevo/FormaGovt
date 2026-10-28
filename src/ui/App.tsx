import { useMemo, useState } from 'react';
import { allocateSeats } from '../engine/seats';
import { applyVariance, type VarianceLevel } from '../engine/variance';
import { randomSeed } from '../engine/random';
import { PARTIES, PARTY_BY_ID } from '../data/parties';
import { SCENARIOS } from '../data/scenarios';
import { Hemicycle } from './Hemicycle';
import { Disclaimer, DisclaimerFooter } from './Disclaimer';

const VARIANCE_LABELS: Record<Exclude<VarianceLevel, 'custom'>, string> = {
  off: 'Off: use the scenario exactly',
  'poll-error': 'Poll error: shares move by about 2 points',
  'election-night': 'Election night: bigger swings and seat upsets',
};

function leftRight(partyId: string): number {
  const stances = Object.values(PARTY_BY_ID[partyId]?.issueStance ?? {});
  return stances.reduce((s, v) => s + v, 0) / Math.max(1, stances.length);
}

export function App() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const [variance, setVariance] = useState<Exclude<VarianceLevel, 'custom'>>('off');
  const [seed, setSeed] = useState(() => randomSeed());

  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const result = useMemo(
    () => allocateSeats(applyVariance(scenario, { level: variance, seed })),
    [scenario, variance, seed],
  );
  const ordered = [...result.parties].sort((a, b) => b.total - a.total);
  // The chamber is drawn left to right by each party's average stance across the policy groups.
  const byPosition = [...result.parties].sort((a, b) => leftRight(a.partyId) - leftRight(b.partyId));

  return (
    <div className="app">
      <Disclaimer />
      <header>
        <h1>FormaGovt</h1>
        <p className="tagline">Form a New Zealand government after the election.</p>
      </header>

      <section className="panel">
        <h2>Election result</h2>
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
          {result.overhang > 0 && ` (includes ${result.overhang} overhang)`}.
        </p>

        <table className="seats">
          <thead>
            <tr>
              <th>Party</th>
              <th>Vote</th>
              <th>Electorates</th>
              <th>Seats</th>
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
                    {p.overhang > 0 && <span className="muted"> (+{p.overhang} overhang)</span>}
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
        <h2>Parties</h2>
        <p className="muted">Negotiation arrives in the next phase. For now, here is who you will be able to play.</p>
        <ul className="party-grid">
          {PARTIES.map((party) => {
            const seats = result.parties.find((p) => p.partyId === party.id)?.total ?? 0;
            return (
              <li key={party.id} className="party-card" style={{ borderTopColor: party.colour }}>
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
              </li>
            );
          })}
        </ul>
      </section>

      <DisclaimerFooter />
    </div>
  );
}
