'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { Play, Pause, Square, Bot } from 'lucide-react';

/**
 * Autonomous mode controls — play/pause/stop buttons + AI status indicator.
 * Shown when driveMode is 'ai'.
 */
export function AutoControls() {
  const mode = useGameStore((s) => s.mode);
  const driveMode = useGameStore((s) => s.driveMode);
  const lapCount = useGameStore((s) => s.lapCount);
  const setMode = useGameStore((s) => s.setMode);

  if (driveMode !== 'ai') return null;
  if (mode !== 'autonomous' && mode !== 'auto-paused') return null;

  const isRunning = mode === 'autonomous';

  function handlePlay() {
    setMode('autonomous');
  }

  function handlePause() {
    setMode('auto-paused');
  }

  function handleStop() {
    // Go to run-complete screen which saves data, then back to menu
    setMode('run-complete');
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
      <div className="bg-black/70 backdrop-blur-sm rounded-2xl border border-gray-700 px-6 py-4 flex items-center gap-5">
        {/* AI indicator */}
        <div className="flex items-center gap-2 pr-4 border-r border-gray-600">
          <Bot className="w-5 h-5 text-purple-400" />
          <div>
            <div className="text-xs text-purple-400 font-medium uppercase tracking-wider">AI Driving</div>
            <div className="text-xs text-gray-400">
              {isRunning ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Running
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  Paused
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Lap counter */}
        <div className="text-center pr-4 border-r border-gray-600">
          <div className="text-lg font-bold text-white">{lapCount}</div>
          <div className="text-[10px] text-gray-400 uppercase">Laps</div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {isRunning ? (
            <button
              onClick={handlePause}
              className="w-11 h-11 rounded-full bg-yellow-600 hover:bg-yellow-500 flex items-center justify-center transition-colors"
              title="Pause AI"
            >
              <Pause className="w-5 h-5 text-white" />
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="w-11 h-11 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-colors"
              title="Resume AI"
            >
              <Play className="w-5 h-5 text-white ml-0.5" />
            </button>
          )}
          <button
            onClick={handleStop}
            className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors"
            title="Stop and return to menu"
          >
            <Square className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Model label */}
        <div className="pl-4 border-l border-gray-600">
          <div className="text-[10px] text-gray-500 uppercase">Model</div>
          <div className="text-xs text-gray-300 font-mono">demo-v0</div>
        </div>
      </div>
    </div>
  );
}
