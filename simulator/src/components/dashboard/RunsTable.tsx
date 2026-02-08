'use client';

import type { TrainingRun } from '@/lib/data/training-data';

/**
 * Sortable table of all training runs with selection for detailed view.
 */
export function RunsTable({
  runs,
  onSelect,
  selectedRun,
}: {
  runs: TrainingRun[];
  onSelect: (run: TrainingRun) => void;
  selectedRun: TrainingRun | null;
}) {
  const sorted = [...runs].reverse();

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">All Training Runs</h3>
        <span className="text-xs text-gray-500">{runs.length} runs · Click a row to inspect frame data</span>
      </div>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900">
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left py-2 pr-3">#</th>
              <th className="text-left py-2 pr-3">Track</th>
              <th className="text-left py-2 pr-3">Mode</th>
              <th className="text-right py-2 pr-3">Laps</th>
              <th className="text-right py-2 pr-3">Frames</th>
              <th className="text-right py-2 pr-3">Best Lap</th>
              <th className="text-right py-2 pr-3">Duration</th>
              <th className="text-right py-2 pr-3">Off-Track</th>
              <th className="text-right py-2">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isSelected = selectedRun?.id === r.id;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-800/30'
                  }`}
                >
                  <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">{runs.length - i}</td>
                  <td className="py-2.5 pr-3 capitalize text-gray-300">{r.trackId.replace('-', ' ')}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.driveMode === 'ai' ? 'bg-purple-900/40 text-purple-400' : 'bg-blue-900/40 text-blue-400'
                    }`}>
                      {r.driveMode === 'ai' ? 'AI' : 'Manual'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-300">{r.lapCount}</td>
                  <td className="py-2.5 pr-3 text-right text-gray-400">{r.frames.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-green-400">
                    {r.bestLapMs ? `${(r.bestLapMs / 1000).toFixed(2)}s` : '—'}
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-400">
                    {(r.durationMs / 1000).toFixed(1)}s
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className={r.offTrackCount > 0 ? 'text-yellow-400' : 'text-gray-600'}>
                      {r.offTrackCount}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
