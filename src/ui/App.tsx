import { useState } from 'react';
import type { SeatResult } from '../engine/seats';
import { Disclaimer, DisclaimerFooter } from './Disclaimer';
import { SetupScreen } from './SetupScreen';
import { GameScreen } from './GameScreen';

export interface GameSetup {
  playerId: string;
  result: SeatResult;
  seed: number;
  scenarioLabel: string;
}

export function App() {
  const [setup, setSetup] = useState<GameSetup | null>(null);
  return (
    <div className="app">
      <Disclaimer />
      <header>
        <h1>FormaGovt</h1>
        <p className="tagline">Form a New Zealand government after the election.</p>
      </header>
      {setup ? <GameScreen setup={setup} onQuit={() => setSetup(null)} /> : <SetupScreen onStart={setSetup} />}
      <DisclaimerFooter />
    </div>
  );
}
