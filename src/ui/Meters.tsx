import { BASELINE, formatBalance, formatChange, type Budget } from '../engine/budget';
import { REVOLT_BELOW, type VoterMood } from '../engine/voters';
import { Explain } from './Explain';

export function BudgetMeter({ budget, preview }: { budget: Budget; preview?: Budget }) {
  const shown = preview ?? budget;
  return (
    <div className="meter">
      <div className="meter-label">
        Budget {BASELINE.year} <Explain topic="budget" label="budget" />
      </div>
      <div className={`meter-value ${shown.balance < 0 ? 'bad' : ''}`}>{formatBalance(shown.balance)}</div>
      <div className="muted small">
        {formatChange(shown.change)} on Treasury's forecast
        {preview && preview.change !== budget.change && ` (now ${formatChange(budget.change)})`}
      </div>
    </div>
  );
}

export function MoodMeter({ mood, preview }: { mood: VoterMood; preview?: VoterMood }) {
  const shown = preview ?? mood;
  return (
    <div className="meter">
      <div className="meter-label">
        Your voters <Explain topic="mood" label="voter mood" />
      </div>
      <div className={`meter-value ${shown.revolt ? 'bad' : ''}`}>
        {shown.mood}/100{shown.revolt ? ' · revolt' : ''}
      </div>
      <div className="mood-bar" role="img" aria-label={`Voter mood ${shown.mood} out of 100`}>
        <div className="mood-fill" style={{ width: `${shown.mood}%` }} />
        <div className="mood-revolt" style={{ left: `${REVOLT_BELOW}%` }} />
      </div>
      {preview && preview.mood !== mood.mood && <div className="muted small">Now {mood.mood}</div>}
    </div>
  );
}
