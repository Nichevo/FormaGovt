import { DELIVERY_2026, DELIVERY_STATUSES, type DeliveryStatus } from '../data/delivery';
import { PARTY_BY_ID } from '../data/parties';

/** "Did it happen?": the real government's agreed policies and how far each has got. */
export function PolicyTracker() {
  const d = DELIVERY_2026;
  if (!d.available) {
    return (
      <div className="policy-tracker">
        <h3>Did it happen?</h3>
        <p className="muted">
          Once the real government is formed and its agreements are published, this section will list every policy it agreed
          to and whether it has been done, changed or dropped, with a source for each.
        </p>
      </div>
    );
  }
  const counts = (Object.keys(DELIVERY_STATUSES) as DeliveryStatus[])
    .map((s) => [s, d.items.filter((i) => i.status === s).length] as const)
    .filter(([, n]) => n > 0);
  return (
    <div className="policy-tracker">
      <h3>Did it happen?</h3>
      <p className="muted small">
        Policies in the{' '}
        <a href={d.agreementUrl} target="_blank" rel="noreferrer">
          government's agreements
        </a>
        , checked {new Date(d.asOf).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}.{' '}
        {counts.map(([s, n]) => `${n} ${DELIVERY_STATUSES[s].toLowerCase()}`).join(', ')}.
      </p>
      <ul className="tracker-list">
        {d.items.map((i) => (
          <li key={i.title}>
            <span className={`tracker-status ${i.status}`}>{DELIVERY_STATUSES[i.status]}</span>{' '}
            <span className="swatch" style={{ background: PARTY_BY_ID[i.party]?.colour ?? '#9a9a9a' }} />
            <strong>{i.title}</strong>. {i.note}{' '}
            <a href={i.sourceUrl} target="_blank" rel="noreferrer">
              Source
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
