import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ElectionDayNotice } from './ui/ElectionDayNotice';
import { isElectionDay } from './electionDay';
import './ui/styles.css';

// On election day nothing of the game shows, only the notice. A page left open
// from the day before checks the clock every 30 seconds and switches over too.
function Root() {
  const [blocked, setBlocked] = useState(isElectionDay);
  useEffect(() => {
    const timer = setInterval(() => setBlocked(isElectionDay()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return blocked ? <ElectionDayNotice /> : <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
