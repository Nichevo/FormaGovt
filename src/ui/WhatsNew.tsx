import { useState } from 'react';
import { readJson, writeJson } from './storage';
import { LATEST_RULES } from '../engine/rules';

const KEY = 'formagovt.seen-rules';

/** Shown once after a rules update, with what changed and how to play the old rules. */
export function WhatsNew() {
  const [seen, setSeen] = useState(() => readJson<string | null>(KEY, null) === LATEST_RULES);
  if (seen) return null;
  const close = () => {
    writeJson(KEY, LATEST_RULES);
    setSeen(true);
  };
  return (
    <section className="panel whats-new" aria-label="What's new">
      <h2>What's new in v{LATEST_RULES}</h2>
      <ul>
        <li>Select all, "all I can accept" and clear buttons on both policy lists, plus filters.</li>
        <li>Other parties guard their own voters: they will not sign a deal their voters would hate.</li>
        <li>Small parties soften their bottom lines as talks go on.</li>
        <li>Agree to a policy as a select committee referral or a members' bill, worth less than putting it in the deal.</li>
        <li>Agree to disagree: set one policy aside in a deal, from the middle of talks.</li>
        <li>Optional leadership challenges: keep your own voters happy or your caucus may replace you.</li>
        <li>A negotiator's hint, folded away above the Send button.</li>
      </ul>
      <p className="muted small">Prefer the old rules? Pick "v1.1 (classic)" under Rules before you start. Shared links keep the rules they were made with.</p>
      <button type="button" className="primary" onClick={close}>
        Got it
      </button>
    </section>
  );
}
