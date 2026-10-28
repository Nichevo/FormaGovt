import { VERSION_LABEL } from '../version';

export function ElectionDayNotice() {
  return (
    <main className="election-day">
      <p>FormaGovt is not available on election day.</p>
      <p>Please come back from 8 November.</p>
      <p className="version">{VERSION_LABEL}</p>
    </main>
  );
}
