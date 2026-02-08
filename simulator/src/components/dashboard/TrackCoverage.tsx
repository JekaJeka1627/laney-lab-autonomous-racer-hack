'use client';

import type { TrainingRun } from '@/lib/data/training-data';
import { getTrack } from '@/lib/tracks/track-data';

/**
 * Track coverage map — shows a 2D top-down view of where the car has driven.
 * Heatmap overlay shows which parts of the track have the most data.
 */
export function TrackCoverage({ runs }: { runs: TrainingRun[] }) {
  // Group runs by track
  const trackGroups = new Map<string, TrainingRun[]>();
  for (const r of runs) {
    const arr = trackGroups.get(r.trackId) || [];
    arr.push(r);
    trackGroups.set(r.trackId, arr);
  }

  if (trackGroups.size === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 text-sm">
        No coverage data available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(trackGroups.entries()).map(([trackId, trackRuns]) => (
        <TrackCoverageMap key={trackId} trackId={trackId} runs={trackRuns} />
      ))}
    </div>
  );
}

function TrackCoverageMap({ trackId, runs }: { trackId: string; runs: TrainingRun[] }) {
  const track = getTrack(trackId);
  const wp = track.waypoints;

  // Collect all position data
  const positions = runs.flatMap((r) => (r.controlLog || []).map((f) => ({ x: f.x, z: f.z })));

  // Compute bounds
  const allX = [...wp.map((p) => p.x), ...positions.map((p) => p.x)];
  const allZ = [...wp.map((p) => p.z), ...positions.map((p) => p.z)];
  const minX = Math.min(...allX) - 5;
  const maxX = Math.max(...allX) + 5;
  const minZ = Math.min(...allZ) - 5;
  const maxZ = Math.max(...allZ) + 5;

  const W = 600;
  const H = 400;
  const PAD = 30;

  function tx(x: number) { return PAD + ((x - minX) / (maxX - minX)) * (W - PAD * 2); }
  function tz(z: number) { return PAD + ((z - minZ) / (maxZ - minZ)) * (H - PAD * 2); }

  // Track centerline path
  const trackPath = wp.map((p, i) => `${i === 0 ? 'M' : 'L'} ${tx(p.x)} ${tz(p.z)}`).join(' ') + ' Z';

  // Downsample positions for rendering
  const step = Math.max(1, Math.floor(positions.length / 500));
  const sampled = positions.filter((_, i) => i % step === 0);

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider capitalize">
          {trackId.replace('-', ' ')} — Track Coverage
        </h3>
        <span className="text-xs text-gray-500">{positions.length.toLocaleString()} data points</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 450 }}>
        {/* Background */}
        <rect x={0} y={0} width={W} height={H} fill="#111" rx={8} />

        {/* Track outline */}
        <path d={trackPath} fill="none" stroke="#333" strokeWidth={track.width * 2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Track surface */}
        <path d={trackPath} fill="none" stroke="#2a2a2a" strokeWidth={track.width * 1.8} strokeLinejoin="round" strokeLinecap="round" />

        {/* Center line */}
        <path d={trackPath} fill="none" stroke="#444" strokeWidth={0.5} strokeDasharray="4 3" />

        {/* Position dots (heatmap) */}
        {sampled.map((p, i) => (
          <circle
            key={i}
            cx={tx(p.x)}
            cy={tz(p.z)}
            r={2}
            fill="#3b82f6"
            opacity={0.15}
          />
        ))}

        {/* Spawn point */}
        <circle cx={tx(track.spawnPos[0])} cy={tz(track.spawnPos[2])} r={5} fill="#22c55e" stroke="#111" strokeWidth={2}>
          <title>Start/Finish</title>
        </circle>

        {/* Waypoint markers (subtle) */}
        {wp.filter((_, i) => i % Math.max(1, Math.floor(wp.length / 16)) === 0).map((p, i) => (
          <circle key={i} cx={tx(p.x)} cy={tz(p.z)} r={2} fill="none" stroke="#555" strokeWidth={0.5} />
        ))}
      </svg>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Start</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 opacity-50" /> Driving data</span>
        <span className="ml-auto">{runs.length} runs · {runs.reduce((s, r) => s + r.lapCount, 0)} laps</span>
      </div>
    </div>
  );
}
