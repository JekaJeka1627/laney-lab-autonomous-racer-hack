'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';

/**
 * Pause/Play toggle + Stop buttons for manual driving.
 * Rendered as a separate z-40 layer so it sits above the PauseOverlay (z-30).
 */
export function ManualDriveControls() {
  const mode = useGameStore((s) => s.mode);
  const driveMode = useGameStore((s) => s.driveMode);
  const setMode = useGameStore((s) => s.setMode);
  const isCoarsePointer = useIsCoarsePointer();

  const isAI = driveMode === 'ai';
  if (isAI) return null;
  if (mode !== 'driving' && mode !== 'paused') return null;
  if (isCoarsePointer) return null;

  const isPaused = mode === 'paused';

  function restartRun() {
    const store = useGameStore.getState();
    const track = getTrack(store.trackId);
    store.resetManualControls();
    store.updateCar({
      x: track.spawnPos[0],
      z: track.spawnPos[2],
      rotation: track.spawnRotation,
      speed: 0,
      steering: 0,
      throttle: 0,
      steerTarget: 0,
      throttleTarget: 0,
    });
    store.resetLaps();
    store.clearControlLog();
    setMode('driving');
  }

  return (
    <div className="absolute bottom-40 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3">
      <button
        onClick={() => setMode(isPaused ? 'driving' : 'paused')}
        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-95 ${
          isPaused
            ? 'bg-green-500 hover:bg-green-400 text-black shadow-green-500/30'
            : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/30'
        }`}
      >
        {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        {isPaused ? 'Play' : 'Pause'}
      </button>
      <button
        onClick={restartRun}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm shadow-lg shadow-black/20 transition-all active:scale-95"
      >
        <RotateCcw className="w-5 h-5" />
        Restart
      </button>
      <button
        onClick={() => setMode('run-complete')}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-lg shadow-red-600/30 transition-all active:scale-95"
      >
        <Square className="w-5 h-5" />
        Stop
      </button>
    </div>
  );
}
