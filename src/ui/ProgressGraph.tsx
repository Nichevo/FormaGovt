import { useState } from 'react';
import type { Party } from '../data/schema';
import { DEFAULT_DAYS, type DayPoint } from '../engine/game';
import { formatBalance } from '../engine/budget';
import { REVOLT_BELOW } from '../engine/voters';

const W = 320;
const H = 150;
const PAD = { top: 12, right: 64, bottom: 22, left: 30 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;
const xFor = (days: number) => (day: number) => PAD.left + ((day - 1) / (days - 1)) * plotW;

interface Series {
  label: string;
  colour: string;
  dashed?: boolean;
  values: { day: number; value: number }[];
}

function LineChart({
  title,
  series,
  max,
  reference,
  hover,
  setHover,
  days,
}: {
  days: number;
  title: string;
  series: Series[];
  max: number;
  reference: { value: number; label: string };
  hover: number | null;
  setHover: (day: number | null) => void;
}) {
  const x = xFor(days);
  const ticks = [1, Math.round(days / 3), Math.round((2 * days) / 3), days];
  const y = (v: number) => PAD.top + plotH - (Math.max(0, Math.min(max, v)) / max) * plotH;
  // Direct labels at each line's end, pushed apart when they would overlap.
  const labelY = series.map((s) => (s.values.length ? y(s.values.at(-1)!.value) : 0));
  if (labelY.length === 2 && Math.abs(labelY[0]! - labelY[1]!) < 12) {
    const mid = (labelY[0]! + labelY[1]!) / 2;
    const up = labelY[0]! <= labelY[1]! ? 0 : 1;
    labelY[up] = mid - 6;
    labelY[1 - up] = mid + 6;
  }
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {ticks.map((d) => (
          <text key={d} className="axis" x={x(d)} y={H - 6} textAnchor="middle">
            Day {d}
          </text>
        ))}
        <line className="reference" x1={PAD.left} x2={PAD.left + plotW} y1={y(reference.value)} y2={y(reference.value)} />
        <text className="axis" x={PAD.left + plotW + 4} y={y(reference.value) + 4}>
          {reference.label}
        </text>
        {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />}
        {series.map((s, i) => {
          const last = s.values.at(-1);
          return (
            <g key={s.label}>
              <polyline
                className="series"
                points={s.values.map((v) => `${x(v.day)},${y(v.value)}`).join(' ')}
                stroke={s.colour}
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
              {s.values.length === 1 && last && <circle cx={x(last.day)} cy={y(last.value)} r={4} fill={s.colour} />}
              {last && (
                <text className="label" x={x(last.day) + 6} y={labelY[i]! + 4}>
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <rect
            key={d}
            className="hit"
            x={x(d) - plotW / (days - 1) / 2}
            y={PAD.top}
            width={plotW / (days - 1)}
            height={plotH}
            onMouseEnter={() => setHover(d)}
            onClick={() => setHover(d)}
          />
        ))}
      </svg>
    </figure>
  );
}

/** Seats for each bloc against the majority line, and your voters' mood, day by day. */
export function ProgressGraph({
  history,
  majority,
  totalSeats,
  player,
  rival,
  days = DEFAULT_DAYS,
}: {
  days?: number;
  history: DayPoint[];
  majority: number;
  totalSeats: number;
  player: Party;
  rival?: Party;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const point = history.find((h) => h.day === hover) ?? history.at(-1);
  const seats: Series[] = [{ label: 'You', colour: player.colour, values: history.map((h) => ({ day: h.day, value: h.playerSeats })) }];
  if (rival) {
    seats.push({ label: rival.shortName, colour: rival.colour, dashed: true, values: history.map((h) => ({ day: h.day, value: h.rivalSeats })) });
  }
  return (
    <section className="panel progress">
      <h2>How it is going</h2>
      <ul className="legend">
        <li>
          <span className="legend-line" style={{ borderColor: player.colour }} /> Your bloc ({player.name})
        </li>
        {rival && (
          <li>
            <span className="legend-line dashed" style={{ borderColor: rival.colour }} /> Rival bloc ({rival.name})
          </li>
        )}
      </ul>
      <div className="charts">
        <LineChart
          title="Seats agreed"
          series={seats}
          max={Math.max(totalSeats * 0.6, majority + 8)}
          reference={{ value: majority, label: `Majority ${majority}` }}
          hover={hover}
          setHover={setHover}
          days={days}
        />
        <LineChart
          title="Your voters' mood"
          series={[{ label: 'Mood', colour: player.colour, values: history.map((h) => ({ day: h.day, value: h.mood })) }]}
          max={100}
          reference={{ value: REVOLT_BELOW, label: 'Revolt' }}
          hover={hover}
          setHover={setHover}
          days={days}
        />
      </div>
      {point && (
        <p className="readout small" aria-live="polite">
          <strong>Day {point.day}:</strong> you {point.playerSeats} seats
          {rival ? `, rival ${point.rivalSeats}` : ''} · mood {point.mood} · budget {formatBalance(point.balance)} · pressure{' '}
          {point.pressure}%
        </p>
      )}
    </section>
  );
}
