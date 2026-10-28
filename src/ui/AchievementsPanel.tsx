import { ACHIEVEMENTS } from '../engine/achievements';
import { loadAchievements } from './achievementStore';

export function AchievementsPanel() {
  const unlocked = loadAchievements();
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <section className="panel">
      <h2>
        Achievements <span className="muted">({count} of {ACHIEVEMENTS.length})</span>
      </h2>
      <ul className="achievements">
        {ACHIEVEMENTS.map((a) => (
          <li key={a.id} className={unlocked[a.id] ? 'on' : ''}>
            <strong>{unlocked[a.id] ? '★ ' : '☆ '}{a.title}</strong>
            <span className="muted small">{a.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
