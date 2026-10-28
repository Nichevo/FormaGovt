import { useState } from 'react';
import { VERSION_LABEL } from '../version';

export const DISCLAIMER =
  'FormaGovt is a game, not a prediction or an official source. Party policies, positions, people and processes are simplified and may be out of date or differ from reality. Characters are based on real public figures, but their responses in the game are invented by the game’s rules. The game is not affiliated with or endorsed by any political party. For accurate information, check each party’s own website and the Electoral Commission.';

const STORAGE_KEY = 'formagovt.disclaimerAccepted';

function readAccepted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'yes';
  } catch {
    return false;
  }
}

/** Shown on first launch until the player taps "I understand". */
export function Disclaimer() {
  const [accepted, setAccepted] = useState(readAccepted);
  if (accepted) return null;
  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'yes');
    } catch {
      // Private browsing: the notice simply shows again next time.
    }
    setAccepted(true);
  };
  return (
    <div className="disclaimer-overlay" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="disclaimer-card">
        <h2 id="disclaimer-title">This is a game</h2>
        <p>{DISCLAIMER}</p>
        <button type="button" onClick={accept}>
          I understand
        </button>
      </div>
    </div>
  );
}

export function DisclaimerFooter() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="footer">
      <button type="button" className="link" onClick={() => setOpen(!open)}>
        A game: simplified and may not match reality
      </button>
      {open && <p>{DISCLAIMER}</p>}
      <p className="version">{VERSION_LABEL}</p>
    </footer>
  );
}
