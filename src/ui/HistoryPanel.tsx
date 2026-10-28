import { useRef, useState } from 'react';
import { PARTY_BY_ID } from '../data/parties';
import { clearHistory, exportHistory, importHistory, loadHistory, type PlayRecord } from './history';
import type { Challenge } from './share';

/** Past games kept in this browser, with a way to replay the same setup. */
export function HistoryPanel({ onReplay }: { onReplay: (c: Challenge) => void }) {
  const [records, setRecords] = useState<PlayRecord[]>(loadHistory);
  const [note, setNote] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section className="panel">
      <h2>Your past games</h2>
      {records.length === 0 ? (
        <p className="muted">Finished games appear here. They are saved in this browser only.</p>
      ) : (
        <ul className="history">
          {records.slice(0, 10).map((r) => {
            const party = PARTY_BY_ID[r.playerId];
            return (
              <li key={r.id} style={{ borderLeftColor: party?.colour }}>
                <span>
                  <strong>{party?.name ?? r.playerId}</strong>{' '}
                  {r.outcome === 'won'
                    ? `formed a government${r.partners.length ? ` with ${r.partners.map((id) => PARTY_BY_ID[id]?.shortName ?? id).join(', ')}` : ''}, score ${r.score}`
                    : r.lostTo === 'rival'
                      ? 'lost to the rival bloc'
                      : 'ran out of time'}
                  <span className="muted small">
                    {' '}
                    · {r.scenarioLabel} · {new Date(r.at).toLocaleDateString()}
                  </span>
                </span>
                <button type="button" onClick={() => onReplay(r)}>
                  Replay
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="row-buttons">
        {records.length > 0 && (
          <button type="button" onClick={exportHistory}>
            Export
          </button>
        )}
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        {records.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete your saved games from this browser?')) {
                clearHistory();
                setRecords([]);
              }
            }}
          >
            Clear
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              setRecords(await importHistory(file));
              setNote('Imported.');
            } catch {
              setNote('That file could not be read.');
            }
            e.target.value = '';
          }}
        />
        {note && <span className="muted small">{note}</span>}
      </div>
    </section>
  );
}
