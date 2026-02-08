'use client';

import type { TrainingRun } from '@/lib/data/training-data';

/**
 * Speed & steering distribution — histogram of speeds and steering angles
 * across all control frames. Shows driving behavior patterns.
 */
export function SpeedDistribution({ runs }: { runs: TrainingRun[] }) {
  // Collect all frames
  const allFrames = runs.flatMap((r) => r.controlLog || []);
  if (allFrames.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 text-sm">
        No frame data available. Drive some laps to see driving analysis.
      </div>
    );
  }

  // Speed histogram (0-90 km/h in 5 km/h buckets)
  const speedBuckets = new Array(18).fill(0);
  for (const f of allFrames) {
    const kmh = Math.abs(f.speed * 3.6);
    const bucket = Math.min(17, Math.floor(kmh / 5));
    speedBuckets[bucket]++;
  }
  const maxSpeedCount = Math.max(...speedBuckets, 1);

  // Steering histogram (-1 to 1 in 0.1 buckets)
  const steerBuckets = new Array(20).fill(0);
  for (const f of allFrames) {
    const bucket = Math.min(19, Math.max(0, Math.floor((f.steering + 1) * 10)));
    steerBuckets[bucket]++;
  }
  const maxSteerCount = Math.max(...steerBuckets, 1);

  // Throttle usage
  const throttleOn = allFrames.filter((f) => f.throttle > 0.1).length;
  const throttlePct = Math.round((throttleOn / allFrames.length) * 100);

  // Average speed
  const avgSpeed = allFrames.reduce((s, f) => s + Math.abs(f.speed * 3.6), 0) / allFrames.length;

  // Steering bias
  const avgSteer = allFrames.reduce((s, f) => s + f.steering, 0) / allFrames.length;

  const W = 380;
  const H = 200;
  const PAD = { top: 20, right: 10, bottom: 30, left: 40 };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Speed distribution */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Speed Distribution</h3>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {speedBuckets.map((count, i) => {
            const barW = (W - PAD.left - PAD.right) / speedBuckets.length - 2;
            const barH = (count / maxSpeedCount) * (H - PAD.top - PAD.bottom);
            const bx = PAD.left + i * ((W - PAD.left - PAD.right) / speedBuckets.length) + 1;
            const by = H - PAD.bottom - barH;
            return (
              <g key={i}>
                <rect x={bx} y={by} width={barW} height={barH} rx={2} fill="#3b82f6" opacity={0.8}>
                  <title>{i * 5}-{(i + 1) * 5} km/h: {count} frames</title>
                </rect>
                {i % 3 === 0 && (
                  <text x={bx + barW / 2} y={H - 8} textAnchor="middle" fill="#666" fontSize={9}>{i * 5}</text>
                )}
              </g>
            );
          })}
          <text x={W / 2} y={H} textAnchor="middle" fill="#555" fontSize={9}>km/h</text>
        </svg>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Avg: <strong className="text-white">{avgSpeed.toFixed(1)} km/h</strong></span>
          <span>Throttle: <strong className="text-white">{throttlePct}%</strong> of time</span>
        </div>
      </div>

      {/* Steering distribution */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Steering Distribution</h3>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {steerBuckets.map((count, i) => {
            const barW = (W - PAD.left - PAD.right) / steerBuckets.length - 1;
            const barH = (count / maxSteerCount) * (H - PAD.top - PAD.bottom);
            const bx = PAD.left + i * ((W - PAD.left - PAD.right) / steerBuckets.length) + 0.5;
            const by = H - PAD.bottom - barH;
            const isCenter = i >= 9 && i <= 10;
            return (
              <g key={i}>
                <rect x={bx} y={by} width={barW} height={barH} rx={1} fill={isCenter ? '#22c55e' : '#f59e0b'} opacity={0.8}>
                  <title>Steering {((i / 10) - 1).toFixed(1)}: {count} frames</title>
                </rect>
              </g>
            );
          })}
          {/* Center line */}
          <line x1={PAD.left + (W - PAD.left - PAD.right) / 2} y1={PAD.top} x2={PAD.left + (W - PAD.left - PAD.right) / 2} y2={H - PAD.bottom} stroke="#22c55e" strokeDasharray="3 3" opacity={0.4} />
          <text x={PAD.left} y={H - 8} fill="#666" fontSize={9}>← Left</text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fill="#666" fontSize={9}>Right →</text>
        </svg>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Bias: <strong className={avgSteer > 0.05 ? 'text-yellow-400' : avgSteer < -0.05 ? 'text-yellow-400' : 'text-green-400'}>
            {avgSteer > 0.05 ? 'Left' : avgSteer < -0.05 ? 'Right' : 'Centered'}
          </strong></span>
          <span>{allFrames.length.toLocaleString()} total frames</span>
        </div>
      </div>

      {/* Speed over time (last run) */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4 md:col-span-2">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Speed vs Steering (Latest Run)</h3>
        <LatestRunChart runs={runs} />
      </div>
    </div>
  );
}

function LatestRunChart({ runs }: { runs: TrainingRun[] }) {
  const lastRun = [...runs].reverse().find((r) => r.controlLog && r.controlLog.length > 10);
  if (!lastRun) {
    return <div className="text-center text-gray-500 text-sm py-8">No detailed frame data available.</div>;
  }

  const frames = lastRun.controlLog;
  const W = 800;
  const H = 200;
  const PAD = { top: 20, right: 30, bottom: 30, left: 50 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxT = frames[frames.length - 1].t;
  const maxSpeed = Math.max(...frames.map((f) => Math.abs(f.speed * 3.6)), 1);

  function tx(t: number) { return PAD.left + (t / maxT) * plotW; }
  function sy(s: number) { return PAD.top + plotH - (Math.abs(s * 3.6) / maxSpeed) * plotH; }
  function sty(st: number) { return PAD.top + plotH / 2 - (st * plotH * 0.4); }

  // Downsample for performance
  const step = Math.max(1, Math.floor(frames.length / 200));
  const sampled = frames.filter((_, i) => i % step === 0);

  const speedPath = sampled.map((f, i) => `${i === 0 ? 'M' : 'L'} ${tx(f.t)} ${sy(f.speed)}`).join(' ');
  const steerPath = sampled.map((f, i) => `${i === 0 ? 'M' : 'L'} ${tx(f.t)} ${sty(f.steering)}`).join(' ');

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 250 }}>
        <path d={speedPath} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
        <path d={steerPath} fill="none" stroke="#f59e0b" strokeWidth={1} opacity={0.6} />
        {/* Y labels */}
        <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" fill="#3b82f6" fontSize={9}>{maxSpeed.toFixed(0)}</text>
        <text x={PAD.left - 8} y={H - PAD.bottom} textAnchor="end" fill="#3b82f6" fontSize={9}>0</text>
        <text x={W / 2} y={H - 5} textAnchor="middle" fill="#666" fontSize={10}>Time</text>
      </svg>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-400 rounded" /> Speed (km/h)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-yellow-400 rounded" /> Steering</span>
        <span className="ml-auto text-gray-600">{lastRun.trackId} · {lastRun.driveMode} · {frames.length} frames</span>
      </div>
    </>
  );
}
