'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';
import { Pause, Play, RotateCcw, ArrowLeft, ArrowRight, Gauge, OctagonX } from 'lucide-react';

function holdButtonClasses(active: boolean, tone: 'blue' | 'green' | 'red' | 'amber') {
  const tones = {
    blue: active ? 'bg-blue-400 text-black border-blue-200' : 'bg-slate-900/85 text-white border-blue-400/40',
    green: active ? 'bg-green-400 text-black border-green-200' : 'bg-slate-900/85 text-white border-green-400/40',
    red: active ? 'bg-red-400 text-black border-red-200' : 'bg-slate-900/85 text-white border-red-400/40',
    amber: active ? 'bg-amber-300 text-black border-amber-100' : 'bg-slate-900/85 text-white border-amber-300/40',
  };

  return [
    'pointer-events-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] border text-sm font-semibold shadow-lg select-none sm:h-20 sm:w-20 sm:rounded-3xl',
    'active:scale-[0.98] touch-manipulation backdrop-blur-sm transition-colors',
    tones[tone],
  ].join(' ');
}

function ActionButton({
  active,
  tone,
  label,
  onPressStart,
  onPressEnd,
  children,
}: {
  active: boolean;
  tone: 'blue' | 'green' | 'red' | 'amber';
  label: string;
  onPressStart: () => void;
  onPressEnd: () => void;
  children: React.ReactNode;
}) {
  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onPressStart();
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onPressEnd();
  };

  return (
    <button
      type="button"
      aria-label={label}
      className={holdButtonClasses(active, tone)}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex flex-col items-center gap-1">
        {children}
        <span className="text-[10px] uppercase tracking-[0.14em] sm:text-[11px] sm:tracking-[0.18em]">{label}</span>
      </div>
    </button>
  );
}

export function TouchDriveControls() {
  const mode = useGameStore((s) => s.mode);
  const driveMode = useGameStore((s) => s.driveMode);
  const controlScheme = useGameStore((s) => s.controlScheme);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);
  const manualControls = useGameStore((s) => s.manualControls);
  const setManualControl = useGameStore((s) => s.setManualControl);
  const resetManualControls = useGameStore((s) => s.resetManualControls);
  const setMode = useGameStore((s) => s.setMode);
  const isCoarsePointer = useIsCoarsePointer();

  if (
    !isCoarsePointer ||
    gamepadConnected ||
    driveMode !== 'manual' ||
    (mode !== 'driving' && mode !== 'paused') ||
    controlScheme === 'tilt'
  ) {
    return null;
  }

  const isPaused = mode === 'paused';

  function restartRun() {
    const store = useGameStore.getState();
    const track = getTrack(store.trackId);
    resetManualControls();
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
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 px-3 sm:px-4">
      <div className="mx-auto relative w-full max-w-6xl min-h-20 sm:min-h-24">
        <div className="absolute left-0 bottom-0 flex items-end gap-2 sm:gap-3">
          <ActionButton
            active={manualControls.left}
            tone="blue"
            label="Left"
            onPressStart={() => setManualControl('left', true)}
            onPressEnd={() => setManualControl('left', false)}
          >
            <ArrowLeft className="h-6 w-6 sm:h-7 sm:w-7" />
          </ActionButton>
          <ActionButton
            active={manualControls.right}
            tone="blue"
            label="Right"
            onPressStart={() => setManualControl('right', true)}
            onPressEnd={() => setManualControl('right', false)}
          >
            <ArrowRight className="h-6 w-6 sm:h-7 sm:w-7" />
          </ActionButton>
        </div>

        <div className="absolute left-1/2 bottom-1 flex -translate-x-1/2 items-end gap-1.5 sm:bottom-1 sm:gap-2">
          <button
            type="button"
            aria-label={isPaused ? 'Resume driving' : 'Pause driving'}
            onClick={() => setMode(isPaused ? 'driving' : 'paused')}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-slate-900/85 text-white shadow-lg backdrop-blur-sm touch-manipulation sm:h-14 sm:w-14"
          >
            {isPaused ? <Play className="h-5 w-5 sm:h-6 sm:w-6" /> : <Pause className="h-5 w-5 sm:h-6 sm:w-6" />}
          </button>
          <button
            type="button"
            aria-label="Restart run"
            onClick={restartRun}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-900/85 text-white shadow-lg backdrop-blur-sm touch-manipulation sm:h-14 sm:w-14"
          >
            <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
          <button
            type="button"
            aria-label="End run"
            onClick={() => setMode('run-complete')}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-red-300/40 bg-slate-900/85 text-white shadow-lg backdrop-blur-sm touch-manipulation sm:h-14 sm:w-14"
          >
            <OctagonX className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="absolute right-0 bottom-0 flex items-end gap-2 sm:gap-3">
          <ActionButton
            active={manualControls.accelerate}
            tone="green"
            label="Gas"
            onPressStart={() => setManualControl('accelerate', true)}
            onPressEnd={() => setManualControl('accelerate', false)}
          >
            <Gauge className="h-6 w-6 sm:h-7 sm:w-7" />
          </ActionButton>
          <ActionButton
            active={manualControls.brake}
            tone="red"
            label="Brake"
            onPressStart={() => setManualControl('brake', true)}
            onPressEnd={() => setManualControl('brake', false)}
          >
            <Pause className="h-6 w-6 sm:h-7 sm:w-7" />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
