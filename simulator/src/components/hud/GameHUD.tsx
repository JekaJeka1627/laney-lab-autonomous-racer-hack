'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { Gauge, Timer, Trophy, Zap, AlertTriangle, Bot, Pause, Play, Square } from 'lucide-react';

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
  const car = useGameStore((s) => s.car);
  const lapCount = useGameStore((s) => s.lapCount);
  const bestLapMs = useGameStore((s) => s.bestLapMs);
  const xp = useGameStore((s) => s.xp);
  const offTrack = useGameStore((s) => s.offTrack);
  const elapsedMs = useGameStore((s) => s.elapsedMs);
  const trackId = useGameStore((s) => s.trackId);
  const driveMode = useGameStore((s) => s.driveMode);
  const mode = useGameStore((s) => s.mode);
  const setMode = useGameStore((s) => s.setMode);

  const isAI = driveMode === 'ai';
  const speedKmh = Math.abs(car.speed * 3.6).toFixed(0);
  const speedPct = Math.min(100, (Math.abs(car.speed) / 25) * 100);

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

      {/* Bottom bar — speedometer + lap timer */}
      <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
        {/* Speedometer */}
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white w-48">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-blue-400" />
            <span className="text-2xl font-bold font-mono">{speedKmh}</span>
            <span className="text-xs text-gray-400">km/h</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${speedPct}%`,
                backgroundColor: speedPct > 80 ? '#ef4444' : speedPct > 50 ? '#f59e0b' : '#3b82f6',
              }}
            />
          </div>
        </div>

        {/* Lap timer */}
        <div className="bg-black/60 backdrop-blur-sm rounded-xl px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-gray-400" />
            <span className="text-2xl font-bold font-mono">{formatTime(elapsedMs)}</span>
          </div>
        </div>
      </div>

      {/* Controls hint — only for manual mode, top-right area below XP */}
      {!isAI && mode === 'driving' && (
        <div className="absolute bottom-20 right-4 bg-black/40 backdrop-blur-sm rounded-xl px-3 py-2 text-white text-xs space-y-0.5">
          <div><kbd className="bg-gray-700 px-1 py-0.5 rounded text-[9px]">W</kbd> / <kbd className="bg-gray-700 px-1 py-0.5 rounded text-[9px]">↑</kbd> Gas</div>
          <div><kbd className="bg-gray-700 px-1 py-0.5 rounded text-[9px]">S</kbd> / <kbd className="bg-gray-700 px-1 py-0.5 rounded text-[9px]">↓</kbd> Brake</div>
          <div><kbd className="bg-gray-700 px-1 py-0.5 rounded text-[9px]">A D</kbd> / <kbd className="bg-gray-700 px-1 py-0.5 rounded text-[9px]">← →</kbd> Steer</div>
        </div>
      )}
    </div>
  );
}
