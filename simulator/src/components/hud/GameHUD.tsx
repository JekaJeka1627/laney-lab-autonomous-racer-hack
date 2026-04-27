'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { useAiDriverStore } from '@/lib/inference/ai-driver-store';
import { Timer, Trophy, Zap, AlertTriangle, Bot } from 'lucide-react';

function formatTime(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  const centis = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

/**
 * Heads-up display overlay — speed, lap time, lap count, XP, off-track warning.
 */
export function GameHUD() {
  const lapCount = useGameStore((s) => s.lapCount);
  const bestLapMs = useGameStore((s) => s.bestLapMs);
  const xp = useGameStore((s) => s.xp);
  const offTrack = useGameStore((s) => s.offTrack);
  const elapsedMs = useGameStore((s) => s.elapsedMs);
  const trackId = useGameStore((s) => s.trackId);
  const driveMode = useGameStore((s) => s.driveMode);
  const mode = useGameStore((s) => s.mode);
  const aiModelStatus = useAiDriverStore((s) => s.status);
  const aiControlSource = useAiDriverStore((s) => s.controlSource);
  const activeModelVersion = useAiDriverStore((s) => s.activeModelVersion);
  const loadedModelVersion = useAiDriverStore((s) => s.loadedModelVersion);

  const isAI = driveMode === 'ai';
  const activeInputDevice = useGameStore((s) => s.activeInputDevice);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* Top bar */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
        {/* Track + Lap info */}
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white space-y-1">
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

        {/* AI badge or XP */}
        <div className="flex items-center gap-2">
          {isAI && (
            <div className="bg-purple-900/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white">
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
          <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-lg font-bold">{xp}</span>
              <span className="text-xs text-gray-400">XP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Off-track warning */}
      {offTrack && (
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 animate-pulse">
          <div className="bg-red-600/80 backdrop-blur-sm rounded-xl px-6 py-3 flex items-center gap-2 text-white font-bold">
            <AlertTriangle className="w-5 h-5" />
            OFF TRACK
          </div>
        </div>
      )}

      {/* Bottom-right — lap timer */}
      <div className="absolute bottom-4 right-4">
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-gray-400" />
            <span className="text-2xl font-bold font-mono">{formatTime(elapsedMs)}</span>
          </div>
        </div>
      </div>

      {/* Controls hint — bottom-left, prominent */}
      {!isAI && (mode === 'driving' || mode === 'paused') && (
        <div className="absolute bottom-4 left-14 bg-black/70 backdrop-blur-sm rounded-2xl border border-gray-700/50 px-4 py-3 text-white text-xs space-y-1.5">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 font-medium mb-1">
            {activeInputDevice === 'gamepad' ? 'Gamepad' : activeInputDevice === 'touch' ? 'Touch' : 'Controls'}
          </div>
          {activeInputDevice === 'gamepad' ? (
            <>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">RT/R2</kbd>
                <span className="text-gray-300">Gas</span>
                <span className="text-gray-600 mx-1">·</span>
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">LT/L2</kbd>
                <span className="text-gray-300">Brake</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">L&#x2194;</kbd>
                <span className="text-gray-300">Steer</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">Start</kbd>
                <span className="text-gray-300">Pause</span>
              </div>
            </>
          ) : activeInputDevice === 'touch' ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-gray-300">Drag</span>
                <span className="text-gray-500">↑</span>
                <span className="text-gray-300">Gas</span>
                <span className="text-gray-600 mx-1">·</span>
                <span className="text-gray-500">↓</span>
                <span className="text-gray-300">Brake</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-300">Drag</span>
                <span className="text-gray-500">←→</span>
                <span className="text-gray-300">Steer</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">W</kbd>
                <span className="text-gray-300">Gas</span>
                <span className="text-gray-600 mx-1">·</span>
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">S</kbd>
                <span className="text-gray-300">Brake</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">A</kbd>
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">D</kbd>
                <span className="text-gray-300">Steer</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">1-5</kbd>
                <span className="text-gray-300">Throttle</span>
                <span className="text-gray-600 mx-1">·</span>
                <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px] font-mono min-w-[28px] text-center">␣</kbd>
                <span className="text-gray-300">Brake</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
