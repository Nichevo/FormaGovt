import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ElectionDayNotice } from './ui/ElectionDayNotice';
import { isElectionDay } from './electionDay';
import './ui/styles.css';

// On election day nothing of the game loads, only the notice.
createRoot(document.getElementById('root')!).render(
  <StrictMode>{isElectionDay() ? <ElectionDayNotice /> : <App />}</StrictMode>,
);
