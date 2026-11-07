import { RESULTS_2026, SCENARIOS } from '../data/scenarios';
import { PARTY_BY_ID } from '../data/parties';
import { allocateSeats } from '../engine/seats';

/** Blocs as they lined up before the election, for the summary only. */
const BLOCS: { label: string; ids: string[] }[] = [
  { label: 'National, ACT and NZ First', ids: ['national', 'act', 'nzfirst'] },
  { label: 'Labour, Greens and Te Pāti Māori', ids: ['labour', 'greens', 'tpm'] },
  { label: 'Opportunity', ids: ['opportunity'] },
];

/** The real 2026 result in a few lines, shown at the top of the setup screen. */
export function ResultSummary() {
  const official = RESULTS_2026.official.available;
  const stage = official ? RESULTS_2026.official : RESULTS_2026.electionNight;
  const scenario = SCENARIOS.find((s) => s.id === (official ? 'result-2026-official' : 'result-2026-night'));
  if (!stage.available || !scenario) return null;
  const result = allocateSeats(scenario);
  const seats = (ids: string[]) => result.parties.filter((p) => ids.includes(p.partyId)).reduce((s, p) => s + p.total, 0);
  const overhang = result.parties.filter((p) => p.overhang > 0);
  return (
    <section className="panel result-summary" aria-label="2026 election result">
      <h2>{official ? '2026 election: official result' : '2026 election: election-night count'}</h2>
      <p>
        {official ? 'Final count, including special votes.' : `Preliminary: ${stage.counted}.`} Parliament has{' '}
        <strong>{result.totalSeats} seats</strong>, so a government needs <strong>{result.majority}</strong>
        {overhang.length > 0 &&
          ` (${result.overhang} overhang: ${overhang.map((p) => `${PARTY_BY_ID[p.partyId]!.name} ${p.overhang}`).join(', ')})`}
        .
      </p>
      <ul className="bloc-list">
        {BLOCS.map((b) => (
          <li key={b.label}>
            {b.label}: <strong>{seats(b.ids)}</strong>
          </li>
        ))}
      </ul>
      {!official && (
        <p className="muted small">
          About one vote in five is still to be counted. Special votes are due in the official result on 27 November 2026
          and have usually moved a seat or two to the left. Try the "Special votes" variance to play a possible final
          result.
        </p>
      )}
      <p className="muted small">
        Source:{' '}
        <a href={stage.sourceUrl} target="_blank" rel="noreferrer">
          {official ? 'Electoral Commission' : 'count as reported on election night'}
        </a>
        {' · '}
        <a href={stage.officialUrl} target="_blank" rel="noreferrer">
          Electoral Commission results
        </a>
      </p>
    </section>
  );
}
