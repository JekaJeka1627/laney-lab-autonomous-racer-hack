'use client';

import { useState } from 'react';
import type { TrainingRun } from '@/lib/data/training-data';

/**
 * Frame-level data viewer — select a run and scrub through individual control frames.
 * Shows steering, throttle, speed, and position at each timestep.
 */
export function FrameTimeline({ runs, selectedRun }: { runs: TrainingRun[]; selectedRun: TrainingRun | null }) {
  const [frameIdx, setFrameIdx] = useState(0);

  // Use selected run or most recent with data
  const run = selectedRun || [...runs].reverse().find((r) => r.controlLog && r.controlLog.length > 0);

  if (!run || !run.controlLog || run.controlLog.length === 0) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center text-gray-500 text-sm">
        No frame data available. Select a run from the &quot;All Runs&quot; tab, or drive some laps with detailed logging.
      </div>
    );
  }

  const frames = run.controlLog;
  const frame = frames[Math.min(frameIdx, frames.length - 1)];
  const totalMs = frames[frames.length - 1].t;

  return (
    <div className="space-y-6">
      {/* Run info */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Frame Inspector — {run.trackId.replace('-', ' ')} ({run.driveMode})
          </h3>
          <span className="text-xs text-gray-500">
            {frames.length} frames · {(totalMs / 1000).toFixed(1)}s
          </span>
        </div>

        {/* Timeline scrubber */}
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={frameIdx}
            onChange={(e) => setFrameIdx(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Frame {frameIdx + 1} / {frames.length}</span>
            <span>{(frame.t / 1000).toFixed(2)}s</span>
          </div>
        </div>

        {/* Frame data */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <FrameValue label="Time" value={`${(frame.t / 1000).toFixed(2)}s`} />
          <FrameValue label="Speed" value={`${Math.abs(frame.speed * 3.6).toFixed(1)} km/h`} />
          <FrameValue label="Steering" value={frame.steering.toFixed(3)} color={Math.abs(frame.steering) > 0.3 ? 'yellow' : 'green'} />
          <FrameValue label="Throttle" value={frame.throttle.toFixed(2)} />
          <FrameValue label="Position X" value={frame.x.toFixed(2)} />
          <FrameValue label="Position Z" value={frame.z.toFixed(2)} />
        </div>
      </div>

      {/* Visual gauges */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Steering gauge */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-3">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider">Steering</h4>
          <div className="relative h-6 bg-gray-800 rounded-full overflow-hidden">
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-600" />
            <div
              className="absolute top-1 bottom-1 w-4 rounded-full bg-yellow-400 transition-all duration-75"
              style={{ left: `calc(${(frame.steering + 1) / 2 * 100}% - 8px)` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-600">
            <span>← Left</span>
            <span>Right →</span>
          </div>
        </div>

        {/* Speed gauge */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-3">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider">Speed</h4>
          <div className="relative h-6 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 rounded-full transition-all duration-75"
              style={{
                width: `${Math.min(100, Math.abs(frame.speed * 3.6) / 90 * 100)}%`,
                background: Math.abs(frame.speed * 3.6) > 60 ? '#ef4444' : Math.abs(frame.speed * 3.6) > 30 ? '#f59e0b' : '#22c55e',
              }}
            />
          </div>
          <div className="text-center text-lg font-bold font-mono text-white">
            {Math.abs(frame.speed * 3.6).toFixed(1)} <span className="text-xs text-gray-500">km/h</span>
          </div>
        </div>

        {/* Throttle gauge */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-3">
          <h4 className="text-xs text-gray-500 uppercase tracking-wider">Throttle</h4>
          <div className="relative h-6 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 bg-blue-500 rounded-full transition-all duration-75"
              style={{ width: `${frame.throttle * 100}%` }}
            />
          </div>
          <div className="text-center text-lg font-bold font-mono text-white">
            {(frame.throttle * 100).toFixed(0)}<span className="text-xs text-gray-500">%</span>
          </div>
        </div>
      </div>

      {/* Raw data preview */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-3">
        <h4 className="text-xs text-gray-500 uppercase tracking-wider">Raw Frame Data (JSON)</h4>
        <pre className="text-xs font-mono text-gray-400 bg-black/30 rounded-xl p-4 overflow-x-auto">
          {JSON.stringify(frame, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function FrameValue({ label, value, color = 'white' }: { label: string; value: string; color?: string }) {
  const colors: Record<string, string> = {
    white: 'text-white',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };
  return (
    <div className="bg-black/20 rounded-xl p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-mono font-bold ${colors[color]}`}>{value}</div>
    </div>
  );
}
