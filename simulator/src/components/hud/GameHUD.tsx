'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';
import { useAiDriverStore } from '@/lib/inference/ai-driver-store';
import { TiltDriveControls } from '@/components/hud/TiltDriveControls';
import { TouchDriveControls } from '@/components/hud/TouchDriveControls';
import { Timer, Trophy, Zap, AlertTriangle, Bot } from 'lucide-react';

function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const centis = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export function GameHUD() {
  const lapCount = useGameStore((s) => s.lapCount);
  const bestLapMs = useGameStore((s) => s.bestLapMs);
  const xp = useGameStore((s) => s.xp);
  const offTrack = useGameStore((s) => s.offTrack);
  const elapsedMs = useGameStore((s) => s.elapsedMs);
  const trackId = useGameStore((s) => s.trackId);
  const driveMode = useGameStore((s) => s.driveMode);
  const mode = useGameStore((s) => s.mode);
  const isCoarsePointer = useIsCoarsePointer();
  const aiModelStatus = useAiDriverStore((s) => s.status);
  const aiControlSource = useAiDriverStore((s) => s.controlSource);
  const activeModelVersion = useAiDriverStore((s) => s.activeModelVersion);
  const loadedModelVersion = useAiDriverStore((s) => s.loadedModelVersion);

  const isAI = driveMode === 'ai';

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="absolute left-3 right-3 top-3 flex flex-col gap-2 sm:left-4 sm:right-4 sm:top-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2.5 text-white space-y-1 sm:px-4 sm:py-3">
          <div className="text-xs uppercase tracking-wider text-gray-400 font-medium">
            {trackId.replace('-', ' ')}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-lg font-bold">{lapCount}</span>
              <span className="text-xs text-gray-400">laps</span>
            </div>
            {bestLapMs !== null && (
              <div className="text-xs text-gray-400">
                Best: <span className="text-green-400 font-mono">{formatTime(bestLapMs)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {isAI && (
            <div className="bg-purple-900/60 backdrop-blur-sm rounded-xl px-3 py-2.5 text-white sm:px-4 sm:py-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-300">AI Driving</span>
              </div>
              <div className="mt-1 text-[11px] text-purple-200/90">
                {aiControlSource === 'model' && (loadedModelVersion || activeModelVersion)
                  ? `Model ${loadedModelVersion || activeModelVersion}`
                  : aiModelStatus === 'loading'
                    ? 'Loading model...'
                    : activeModelVersion
                      ? `Waypoint fallback (${activeModelVersion})`
                      : 'Waypoint demo AI'}
              </div>
            </div>
          )}
          <div className="bg-black/60 backdrop-blur-sm rounded-xl px-3 py-2.5 text-white sm:px-4 sm:py-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-lg font-bold">{xp}</span>
              <span className="text-xs text-gray-400">XP</span>
            </div>
          </div>
        </div>
      </div>

      {offTrack && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 animate-pulse">
          <div className="bg-red-600/80 backdrop-blur-sm rounded-xl px-6 py-3 flex items-center gap-2 text-white font-bold">
            <AlertTriangle className="w-5 h-5" />
            OFF TRACK
          </div>
        </div>
      )}

      <div className="absolute bottom-24 right-3 sm:bottom-4 sm:right-4">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-gray-400" />
            <span className="text-xl font-bold font-mono sm:text-2xl">{formatTime(elapsedMs)}</span>
          </div>
        </div>
      </div>

      {!isAI && (mode === 'driving' || mode === 'paused') && (
        <div className="absolute bottom-24 left-3 max-w-[236px] rounded-2xl border border-gray-700/50 bg-black/70 px-3 py-2.5 text-xs text-white backdrop-blur-sm sm:bottom-4 sm:left-14 sm:max-w-none sm:px-4 sm:py-3">
          <div className="mb-1 text-[9px] font-medium uppercase tracking-wider text-gray-500">Controls</div>
          {isCoarsePointer ? (
            <div className="space-y-1.5">
              <div className="text-gray-300">Left thumb steers. Right thumb controls gas and brake.</div>
              <div className="text-gray-400">Pause, restart, and end-run stay centered above the touch controls.</div>
              <div className="text-gray-500">Landscape is recommended for the clearest view.</div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <kbd className="min-w-[28px] rounded bg-gray-700 px-1.5 py-0.5 text-center font-mono text-[10px]">W</kbd>
                <span className="text-gray-300">Gas</span>
                <span className="mx-1 text-gray-600">·</span>
                <kbd className="min-w-[28px] rounded bg-gray-700 px-1.5 py-0.5 text-center font-mono text-[10px]">S</kbd>
                <span className="text-gray-300">Brake</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="min-w-[28px] rounded bg-gray-700 px-1.5 py-0.5 text-center font-mono text-[10px]">A</kbd>
                <kbd className="min-w-[28px] rounded bg-gray-700 px-1.5 py-0.5 text-center font-mono text-[10px]">D</kbd>
                <span className="text-gray-300">Steer</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="min-w-[28px] rounded bg-gray-700 px-1.5 py-0.5 text-center font-mono text-[10px]">1-5</kbd>
                <span className="text-gray-300">Throttle</span>
                <span className="mx-1 text-gray-600">·</span>
                <kbd className="min-w-[28px] rounded bg-gray-700 px-1.5 py-0.5 text-center font-mono text-[10px]">␣</kbd>
                <span className="text-gray-300">Brake</span>
              </div>
            </div>
          )}
        </div>
      )}

      <TouchDriveControls />
      <TiltDriveControls />
    </div>
  );
}
