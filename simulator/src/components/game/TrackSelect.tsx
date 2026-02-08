'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { TRACKS } from '@/lib/tracks/track-data';
import { Play, Lock, Trophy, Zap } from 'lucide-react';

const difficultyColors: Record<string, string> = {
  beginner: 'text-green-400 bg-green-400/10 border-green-400/30',
  intermediate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  advanced: 'text-red-400 bg-red-400/10 border-red-400/30',
  special: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
};

/**
 * Track selection menu — shown before driving.
 */
export function TrackSelect() {
  const setTrackId = useGameStore((s) => s.setTrackId);
  const setMode = useGameStore((s) => s.setMode);
  const xp = useGameStore((s) => s.xp);
  const lapCount = useGameStore((s) => s.lapCount);

  function startDriving(trackId: string) {
    setTrackId(trackId);
    setMode('driving');
    useGameStore.getState().resetLaps();
    useGameStore.getState().clearControlLog();
    // Set spawn position
    const track = TRACKS.find((t) => t.id === trackId)!;
    useGameStore.getState().updateCar({
      x: track.spawnPos[0],
      z: track.spawnPos[2],
      rotation: track.spawnRotation,
      speed: 0,
      steering: 0,
      throttle: 0,
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0f23] to-[#1a1a2e] text-white flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Deep Racer
          </h1>
          <p className="text-gray-400 text-lg">
            Drive. Train. Race the AI.
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="font-bold">{xp}</span>
            <span className="text-gray-400">XP</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="font-bold">{lapCount}</span>
            <span className="text-gray-400">Total Laps</span>
          </div>
        </div>

        {/* Track cards */}
        <div className="grid gap-4">
          {TRACKS.map((track) => {
            const locked = track.unlockRequirement
              ? lapCount < track.unlockRequirement.totalClassLaps
              : false;

            return (
              <button
                key={track.id}
                onClick={() => !locked && startDriving(track.id)}
                disabled={locked}
                className={[
                  'w-full text-left rounded-2xl border p-5 transition-all',
                  locked
                    ? 'border-gray-700 bg-gray-800/30 opacity-50 cursor-not-allowed'
                    : 'border-gray-700 bg-white/5 hover:bg-white/10 hover:border-blue-500/50 cursor-pointer',
                ].join(' ')}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold">{track.name}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${difficultyColors[track.difficulty]}`}>
                        {track.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">{track.description}</p>
                    {locked && track.unlockRequirement && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <Lock className="w-3 h-3" />
                        Unlocks at {track.unlockRequirement.totalClassLaps} class laps
                      </p>
                    )}
                  </div>
                  {!locked && (
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                      <Play className="w-5 h-5 ml-0.5" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500">
          Every lap you drive generates training data for the AI model.
          The more you drive, the smarter the racer gets.
        </p>
      </div>
    </div>
  );
}
