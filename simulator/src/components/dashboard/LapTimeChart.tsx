'use client';

import type { TrainingRun } from '@/lib/data/training-data';

/**
 * Lap time progression chart — shows how lap times improve over runs.
 * Uses pure SVG for zero-dependency rendering.
 */
export function LapTimeChart({ runs }: { runs: TrainingRun[] }) {
  const lapsWithTimes = runs
    .filter((r) => r.bestLapMs !== null && r.bestLapMs > 0)
    .map((r, i) => ({ idx: i + 1, time: r.bestLapMs! / 1000, track: r.trackId, mode: r.driveMode }));

  if (lapsWithTimes.length === 0) {
    return <EmptyChart message="No lap time data yet. Complete some laps to see your progression." />;
  }

  const maxTime = Math.max(...lapsWithTimes.map((l) => l.time));
  const minTime = Math.min(...lapsWithTimes.map((l) => l.time));
  const W = 800;
  const H = 300;
  const PAD = { top: 30, right: 30, bottom: 40, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const yMin = Math.max(0, minTime - 2);
  const yMax = maxTime + 2;

  function x(i: number) {
    return PAD.left + (i / Math.max(1, lapsWithTimes.length - 1)) * plotW;
  }
  function y(t: number) {
    return PAD.top + plotH - ((t - yMin) / (yMax - yMin)) * plotH;
  }

  const linePath = lapsWithTimes.map((l, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(l.time)}`).join(' ');

  // Trend line (simple moving average)
  const windowSize = Math.max(1, Math.floor(lapsWithTimes.length / 5));
  const trendPoints = lapsWithTimes.map((_, i) => {
    const start = Math.max(0, i - windowSize);
    const slice = lapsWithTimes.slice(start, i + 1);
    const avg = slice.reduce((s, l) => s + l.time, 0) / slice.length;
    return { idx: i, time: avg };
  });
  const trendPath = trendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.time)}`).join(' ');

  // Y-axis ticks
  const yTicks: number[] = [];
  const step = Math.ceil((yMax - yMin) / 5);
  for (let t = Math.ceil(yMin); t <= yMax; t += step) yTicks.push(t);

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Lap Time Progression</h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-400 rounded" /> Lap Times</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-400 rounded" /> Trend</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        Each dot is your best lap time from one driving session. <strong className="text-gray-300">Lower = faster.</strong> The green trend line shows whether you&apos;re improving over time. Purple dots = AI driving, blue dots = you driving.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 350 }}>
        {/* Grid lines */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} y1={y(t)} x2={W - PAD.right} y2={y(t)} stroke="#333" strokeDasharray="4 4" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fill="#666" fontSize={11}>{t}s</text>
          </g>
        ))}

        {/* Trend line */}
        <path d={trendPath} fill="none" stroke="#22c55e" strokeWidth={2} opacity={0.6} />

        {/* Data line */}
        <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />

        {/* Data points */}
        {lapsWithTimes.map((l, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(l.time)}
            r={4}
            fill={l.mode === 'ai' ? '#a855f7' : '#3b82f6'}
            stroke="#0a0a1a"
            strokeWidth={2}
          >
            <title>{l.track} ({l.mode}) — {l.time.toFixed(2)}s</title>
          </circle>
        ))}

        {/* X-axis label */}
        <text x={W / 2} y={H - 5} textAnchor="middle" fill="#666" fontSize={11}>Run #</text>

        {/* Best lap highlight */}
        <line x1={PAD.left} y1={y(minTime)} x2={W - PAD.right} y2={y(minTime)} stroke="#22c55e" strokeDasharray="6 3" opacity={0.4} />
        <text x={W - PAD.right + 5} y={y(minTime) + 4} fill="#22c55e" fontSize={10}>Best</text>
      </svg>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 text-sm">
      {message}
    </div>
  );
}
