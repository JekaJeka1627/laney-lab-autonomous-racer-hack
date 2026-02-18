'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/lib/stores/game-store';
import { TRACKS } from '@/lib/tracks/track-data';
import { getStats, type AccumulatedStats } from '@/lib/data/training-data';
import { Play, Lock, Trophy, Zap, Bot, Info, Database, BarChart3 } from 'lucide-react';


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

  // Use persisted accumulated stats for unlock gating & header display
  // (Zustand lapCount resets per-run; localStorage totalLaps persists across sessions)
  const [persistedStats, setPersistedStats] = useState<AccumulatedStats | null>(null);
  useEffect(() => { setPersistedStats(getStats()); }, []);
  const totalLaps = persistedStats?.totalLaps ?? 0;

  function initTrack(trackId: string) {
    setTrackId(trackId);
    useGameStore.getState().resetLaps();
    useGameStore.getState().clearControlLog();
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

  function startDriving(trackId: string) {
    initTrack(trackId);
    useGameStore.getState().setDriveMode('manual');
    setMode('driving');
  }

  function startAutonomous(trackId: string) {
    initTrack(trackId);
    useGameStore.getState().setDriveMode('ai');
    setMode('autonomous');
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
            <span className="font-bold">{persistedStats?.totalFrames?.toLocaleString() ?? 0}</span>
            <span className="text-gray-400">Frames</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 rounded-full px-4 py-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="font-bold">{totalLaps}</span>
            <span className="text-gray-400">Total Laps</span>
          </div>
        </div>

        {/* Track cards */}
        <div className="grid gap-4">
          {TRACKS.map((track) => {
            const locked = track.unlockRequirement
              ? totalLaps < track.unlockRequirement.totalClassLaps
              : false;

            return (
              <div
                key={track.id}
                role="button"
                tabIndex={locked ? -1 : 0}
                onClick={() => !locked && startDriving(track.id)}
                onKeyDown={(e) => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startDriving(track.id); } }}
                aria-disabled={locked || undefined}
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); startAutonomous(track.id); }}
                        className="w-11 h-11 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors"
                        title="Watch AI drive"
                      >
                        <Bot className="w-5 h-5" />
                      </button>
                      <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
                        <Play className="w-5 h-5 ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Training data stats */}
        <DataBar />

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <p>Every lap you drive generates training data for the AI model.</p>
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-green-400 hover:text-green-300 transition-colors flex-shrink-0"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <Link
            href="/about"
            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
          >
            <Info className="w-3.5 h-3.5" /> About
          </Link>
        </div>
      </div>
    </div>
  );
}

function DataBar() {
  const [stats, setStats] = useState<AccumulatedStats | null>(null);

  useEffect(() => {
    setStats(getStats());
  }, []);

  if (!stats || stats.totalRuns === 0) return null;

  return (
    <div className="bg-white/5 border border-gray-700 rounded-2xl px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        <Database className="w-4 h-4 text-green-400" />
        <span className="font-medium">Training Data</span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span><strong className="text-white">{stats.totalRuns}</strong> runs</span>
        <span><strong className="text-white">{stats.totalLaps}</strong> laps</span>
        <span><strong className="text-white">{stats.totalFrames.toLocaleString()}</strong> frames</span>
      </div>
    </div>
  );
}
