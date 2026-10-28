import { useEffect, useState } from 'react';
import type { SeatResult } from '../engine/seats';
import { Disclaimer, DisclaimerFooter } from './Disclaimer';
import { SetupScreen } from './SetupScreen';
import { GameScreen } from './GameScreen';
import { About } from './About';
import { parseChallenge, type Challenge } from './share';

export interface GameSetup extends Required<Challenge> {
  result: SeatResult;
  scenarioLabel: string;
  /** When play started, which identifies the game in the history. */
  startedAt: number;
}

export function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(() => parseChallenge(location.hash));
  const [about, setAbout] = useState(() => location.hash === '#about');

  useEffect(() => {
    const onHash = () => {
      setAbout(location.hash === '#about');
      const c = parseChallenge(location.hash);
      if (c) {
        setChallenge(c);
        setSetup(null);
      }
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const openAbout = (open: boolean) => {
    setAbout(open);
    history.replaceState(null, '', open ? '#about' : location.pathname);
  };

  return (
    <div className="app">
      <Disclaimer />
      <header className="app-header">
        <div>
          <h1>FormaGovt</h1>
          <p className="tagline">Form a New Zealand government after the election.</p>
        </div>
        <button type="button" className="link" onClick={() => openAbout(!about)}>
          {about ? 'Back' : 'About and how to play'}
        </button>
      </header>
      {about && <About onClose={() => openAbout(false)} />}
      {/* The game stays mounted under the About page so nothing is lost. */}
      <div hidden={about}>
        {setup ? (
          <GameScreen
            setup={setup}
            onQuit={() => setSetup(null)}
            onRematch={() => {
              const { scenarioId, variance, seed, playerId } = setup;
              setChallenge({ scenarioId, variance, seed, playerId });
              setSetup(null);
            }}
          />
        ) : (
          <SetupScreen key={JSON.stringify(challenge)} initial={challenge} onStart={setSetup} onReplay={setChallenge} />
        )}
      </div>
      <DisclaimerFooter />
    </div>
  );
}
