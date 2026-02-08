'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';
import { Play, Home, RotateCcw } from 'lucide-react';

/**
 * Pause menu overlay — resume, restart, or return to menu.
 */
export function PauseOverlay() {
  const mode = useGameStore((s) => s.mode);
  const setMode = useGameStore((s) => s.setMode);
  const lapCount = useGameStore((s) => s.lapCount);
  const controlLog = useGameStore((s) => s.controlLog);

  if (mode !== 'paused') return null;

  function resume() {
    setMode('driving');
  }

  function restart() {
    const store = useGameStore.getState();
    const track = getTrack(store.trackId);
    store.updateCar({
      x: track.spawnPos[0],
      z: track.spawnPos[2],
      rotation: track.spawnRotation,
      speed: 0,
      steering: 0,
      throttle: 0,
    });
    store.resetLaps();
    store.clearControlLog();
    setMode('driving');
  }

  function backToMenu() {
    setMode('menu');
  }

  return (
    <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-sm w-full space-y-6 text-center">
        <h2 className="text-2xl font-bold text-white">Paused</h2>

        <div className="text-sm text-gray-400 space-y-1">
          <div>Laps completed: <span className="text-white font-bold">{lapCount}</span></div>
          <div>Data frames captured: <span className="text-white font-bold">{controlLog.length}</span></div>
        </div>

        <div className="space-y-3">
          <button
            onClick={resume}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
          >
            <Play className="w-4 h-4" /> Resume
          </button>
          <button
            onClick={() => { restart(); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Restart
          </button>
          <button
            onClick={backToMenu}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors"
          >
            <Home className="w-4 h-4" /> Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
