'use client';

import type { TrainingRun } from '@/lib/data/training-data';

/**
 * Steering vs Speed heatmap — shows the relationship between speed and steering angle.
 * Useful for understanding driving behavior patterns.
 */
export function SteeringHeatmap({ runs }: { runs: TrainingRun[] }) {
  // Placeholder — this component is used as a tab but the main analysis is in SpeedDistribution
  const allFrames = runs.flatMap((r) => r.controlLog || []);
  if (allFrames.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 text-sm">
        No frame data available.
      </div>
    );
  }

  // Build a 2D grid: speed (y) vs steering (x)
  const GRID = 20;
  const grid: number[][] = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
  const maxSpeed = 90; // km/h

  for (const f of allFrames) {
    const sx = Math.min(GRID - 1, Math.max(0, Math.floor(((f.steering + 1) / 2) * GRID)));
    const sy = Math.min(GRID - 1, Math.max(0, Math.floor((Math.abs(f.speed * 3.6) / maxSpeed) * GRID)));
    grid[sy][sx]++;
  }

  const maxCount = Math.max(...grid.flat(), 1);

  const cellW = 20;
  const cellH = 14;
  const W = GRID * cellW + 60;
  const H = GRID * cellH + 40;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Speed vs Steering Heatmap</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 400 }}>
        {grid.map((row, yi) =>
          row.map((count, xi) => {
            if (count === 0) return null;
            const intensity = Math.pow(count / maxCount, 0.5); // sqrt scale for better visibility
            const r = Math.round(59 + intensity * 196);
            const g = Math.round(130 - intensity * 80);
            const b = Math.round(246 - intensity * 200);
            return (
              <rect
                key={`${xi}-${yi}`}
                x={50 + xi * cellW}
                y={10 + (GRID - 1 - yi) * cellH}
                width={cellW - 1}
                height={cellH - 1}
                rx={2}
                fill={`rgb(${r},${g},${b})`}
                opacity={0.3 + intensity * 0.7}
              >
                <title>Steering: {((xi / GRID) * 2 - 1).toFixed(1)}, Speed: {((yi / GRID) * maxSpeed).toFixed(0)} km/h — {count} frames</title>
              </rect>
            );
          }),
        )}
        {/* Axes */}
        <text x={25} y={H / 2} textAnchor="middle" fill="#666" fontSize={10} transform={`rotate(-90, 25, ${H / 2})`}>Speed (km/h)</text>
        <text x={W / 2} y={H - 5} textAnchor="middle" fill="#666" fontSize={10}>← Left · Steering · Right →</text>
      </svg>
      <p className="text-xs text-gray-600 text-center">
        Brighter = more time spent at that speed/steering combination. Ideal driving shows a bright center column (straight) with dim edges (turns at lower speed).
      </p>
    </div>
  );
}
