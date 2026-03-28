'use client';

import { useGameStore } from '@/lib/stores/game-store';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';

export function ControlsHUD() {
  const car = useGameStore((s) => s.car);
  const driveMode = useGameStore((s) => s.driveMode);
  const mode = useGameStore((s) => s.mode);
  const offTrack = useGameStore((s) => s.offTrack);
  const offTrackCount = useGameStore((s) => s.offTrackCount);
  const isCoarsePointer = useIsCoarsePointer();

  const isActive = mode === 'driving' || mode === 'autonomous' || mode === 'paused' || mode === 'auto-paused';
  if (!isActive) return null;

  const isAI = driveMode === 'ai';
  const maxSpeed = 25;
  const speedPct = Math.min(1, Math.abs(car.speed) / maxSpeed);
  const steerAngleDeg = car.steering * 90;
  const containerClasses = isCoarsePointer
    ? 'absolute right-3 top-24 z-10'
    : 'absolute bottom-4 left-1/2 z-10 -translate-x-1/2';
  const shellClasses = isCoarsePointer
    ? 'rounded-2xl border border-gray-700/50 bg-black/70 px-3 py-2 backdrop-blur-sm'
    : 'rounded-2xl border border-gray-700/50 bg-black/70 px-4 py-3 backdrop-blur-sm';
  const wheelSize = isCoarsePointer ? 'w-16 h-16' : 'w-24 h-24';
  const iconSize = isCoarsePointer ? 'w-[46px] h-[46px]' : 'w-[70px] h-[70px]';
  const barHeight = isCoarsePointer ? 'h-16' : 'h-24';

  return (
    <div className={containerClasses}>
      <div className={`${shellClasses} flex items-end gap-3 ${isCoarsePointer ? 'shadow-xl' : ''}`}>
        <div className="flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">Steer</div>
          <div className={`relative ${wheelSize}`}>
            <svg viewBox="0 0 56 56" className={wheelSize}>
              <circle cx="28" cy="28" r="25" fill="none" stroke="#374151" strokeWidth="2" />
              <line
                x1="28"
                y1="6"
                x2="28"
                y2="12"
                stroke="#6366f1"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.6"
                transform={`rotate(${car.steerTarget * 90}, 28, 28)`}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center transition-transform duration-75"
              style={{ transform: `rotate(${steerAngleDeg}deg)` }}
            >
              <svg viewBox="0 0 40 40" className={iconSize}>
                <circle cx="20" cy="20" r="15" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                <circle cx="20" cy="20" r="3" fill="#9ca3af" />
                <line x1="20" y1="5" x2="20" y2="17" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="26" x2="17" y2="21" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" />
                <line x1="32" y1="26" x2="23" y2="21" stroke="#e5e7eb" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="text-[10px] font-mono text-gray-400">
            {car.steering > 0 ? '+' : ''}
            {car.steering.toFixed(2)}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">Throttle</div>
          <div className={`relative w-4 ${barHeight} overflow-hidden rounded-full border border-gray-600 bg-gray-800`}>
            <div
              className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-75"
              style={{
                height: `${car.throttle * 100}%`,
                backgroundColor: car.throttle > 0.8 ? '#22c55e' : car.throttle > 0.4 ? '#eab308' : '#6b7280',
              }}
            />
            <div className="absolute left-0 right-0 h-0.5 bg-indigo-400" style={{ bottom: `${car.throttleTarget * 100}%` }} />
          </div>
          <div className="text-[10px] font-mono text-gray-400">{(car.throttle * 100).toFixed(0)}%</div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 font-medium">Speed</div>
          <div className={`relative w-4 ${barHeight} overflow-hidden rounded-full border border-gray-600 bg-gray-800`}>
            <div
              className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-75"
              style={{
                height: `${speedPct * 100}%`,
                backgroundColor: speedPct > 0.8 ? '#ef4444' : speedPct > 0.5 ? '#f59e0b' : '#3b82f6',
              }}
            />
          </div>
          <div className="text-[10px] font-mono text-gray-400">{Math.abs(car.speed).toFixed(1)}</div>
        </div>

        <div className="flex flex-col items-center gap-1 border-l border-gray-700 pl-2">
          <div
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isAI ? 'bg-purple-900/60 text-purple-300' : 'bg-blue-900/60 text-blue-300'
            }`}
          >
            {isAI ? 'AI' : 'Human'}
          </div>
          {offTrack && <div className="text-[9px] font-bold text-red-400 animate-pulse">OFF TRACK</div>}
          <div className="text-[9px] text-gray-500">OT: {offTrackCount}</div>
        </div>
      </div>
    </div>
  );
}
