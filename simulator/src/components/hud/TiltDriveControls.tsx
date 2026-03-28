'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, OctagonX, Pause, Play, RotateCcw } from 'lucide-react';
import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';
import { useDeviceOrientation } from '@/lib/hooks/useDeviceOrientation';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function TiltDriveControls() {
  const mode = useGameStore((s) => s.mode);
  const driveMode = useGameStore((s) => s.driveMode);
  const controlScheme = useGameStore((s) => s.controlScheme);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);
  const setControlScheme = useGameStore((s) => s.setControlScheme);
  const manualControls = useGameStore((s) => s.manualControls);
  const analogThrottle = useGameStore((s) => s.analogThrottle);
  const setManualControl = useGameStore((s) => s.setManualControl);
  const resetManualControls = useGameStore((s) => s.resetManualControls);
  const setAnalogSteer = useGameStore((s) => s.setAnalogSteer);
  const setAnalogThrottle = useGameStore((s) => s.setAnalogThrottle);
  const setMode = useGameStore((s) => s.setMode);
  const isCoarsePointer = useIsCoarsePointer();
  const {
    supported,
    permissionGranted,
    gamma,
    requestPermission,
    calibrate,
    getCalibratedGamma,
  } = useDeviceOrientation();

  const [brakeFlash, setBrakeFlash] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const brakeFlashTimeoutRef = useRef<number | null>(null);

  const isActive = driveMode === 'manual' && (mode === 'driving' || mode === 'paused');
  const isPaused = mode === 'paused';
  const requiresPermission = useMemo(() => {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    return typeof orientationEvent.requestPermission === 'function';
  }, []);

  useEffect(() => {
    if (!isCoarsePointer || controlScheme !== 'tilt') return;
    if (!supported) {
      setControlScheme('buttons');
    }
  }, [controlScheme, isCoarsePointer, setControlScheme, supported]);

  const fallbackMessage = !supported && controlScheme !== 'tilt'
    ? 'Tilt steering is unavailable on this device. Button controls are enabled.'
    : null;

  useEffect(() => {
    if (!isActive || controlScheme !== 'tilt' || !supported) return;
    if (requiresPermission && !permissionGranted) {
      setAnalogSteer(0);
      return;
    }

    const maxTilt = 30;
    const calibrated = getCalibratedGamma() / maxTilt;
    setAnalogSteer(clamp(calibrated, -1, 1));
  }, [
    controlScheme,
    gamma,
    getCalibratedGamma,
    isActive,
    permissionGranted,
    requiresPermission,
    setAnalogSteer,
    supported,
  ]);

  useEffect(() => {
    if (isActive && controlScheme === 'tilt') return;
    setAnalogSteer(0);
    setAnalogThrottle(0);
    setManualControl('brake', false);
  }, [controlScheme, isActive, setAnalogSteer, setAnalogThrottle, setManualControl]);

  useEffect(() => {
    return () => {
      if (brakeFlashTimeoutRef.current !== null) {
        window.clearTimeout(brakeFlashTimeoutRef.current);
      }
    };
  }, []);

  if (!isCoarsePointer || gamepadConnected || !isActive || controlScheme !== 'tilt') {
    return null;
  }

  function restartRun() {
    const store = useGameStore.getState();
    const track = getTrack(store.trackId);
    resetManualControls();
    setAnalogSteer(0);
    setAnalogThrottle(0);
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
    store.setMode('driving');
  }

  async function handleCalibrate() {
    if (requiresPermission && !permissionGranted) {
      const granted = await requestPermission();
      if (!granted) {
        setPermissionMessage('Motion access was denied. Button controls are enabled.');
        setControlScheme('buttons');
        return;
      }
    }
    calibrate();
    setPermissionMessage('Tilt center updated.');
  }

  function updateThrottleFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const normalized = 1 - (y / rect.height);
    setManualControl('brake', false);
    setAnalogThrottle(clamp(normalized, 0, 1));
  }

  function handleThrottleStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateThrottleFromPointer(event);
  }

  function handleThrottleMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateThrottleFromPointer(event);
  }

  function handleThrottleEnd(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setAnalogThrottle(0);
  }

  function handleBrakeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setAnalogThrottle(0);
    setManualControl('brake', true);
    setBrakeFlash(true);
    if (brakeFlashTimeoutRef.current !== null) {
      window.clearTimeout(brakeFlashTimeoutRef.current);
    }
    brakeFlashTimeoutRef.current = window.setTimeout(() => setBrakeFlash(false), 180);
  }

  function handleBrakeEnd(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setManualControl('brake', false);
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div
        className="pointer-events-auto absolute inset-y-0 left-0 w-1/2 touch-manipulation"
        onPointerDown={handleBrakeStart}
        onPointerUp={handleBrakeEnd}
        onPointerCancel={handleBrakeEnd}
        onPointerLeave={handleBrakeEnd}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-red-400/30 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-red-200 backdrop-blur-sm">
          {manualControls.brake || brakeFlash ? 'Braking' : 'Brake'}
        </div>
      </div>

      <div
        className="pointer-events-auto absolute inset-y-0 right-0 w-1/2 touch-manipulation"
        onPointerDown={handleThrottleStart}
        onPointerMove={handleThrottleMove}
        onPointerUp={handleThrottleEnd}
        onPointerCancel={handleThrottleEnd}
        onPointerLeave={handleThrottleEnd}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="absolute bottom-24 right-4 top-24 w-3 overflow-hidden rounded-full border border-cyan-300/35 bg-black/35 backdrop-blur-sm">
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full bg-cyan-300/90 transition-all duration-75"
            style={{ height: `${analogThrottle * 100}%` }}
          />
        </div>
        <div className="absolute right-10 top-1/2 -translate-y-1/2 rounded-full border border-cyan-300/30 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100 backdrop-blur-sm">
          Throttle
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-4 flex justify-center px-3">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-[1.5rem] border border-white/15 bg-slate-950/82 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
          <button
            type="button"
            aria-label={isPaused ? 'Resume driving' : 'Pause driving'}
            onClick={() => setMode(isPaused ? 'driving' : 'paused')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-300/40 bg-slate-900/90 text-white touch-manipulation"
          >
            {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button
            type="button"
            aria-label="Restart run"
            onClick={restartRun}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-slate-900/90 text-white touch-manipulation"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Calibrate tilt steering"
            onClick={() => void handleCalibrate()}
            className="flex h-11 items-center gap-2 rounded-full border border-cyan-300/35 bg-slate-900/90 px-4 text-sm font-semibold text-cyan-100 touch-manipulation"
          >
            <Compass className="h-4 w-4" />
            Calibrate
          </button>
          <button
            type="button"
            aria-label="End run"
            onClick={() => setMode('run-complete')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-red-300/40 bg-slate-900/90 text-white touch-manipulation"
          >
            <OctagonX className="h-5 w-5" />
          </button>
        </div>
      </div>

      {permissionMessage || fallbackMessage ? (
        <div className="pointer-events-none absolute inset-x-4 top-24 flex justify-center">
          <div className="rounded-full border border-cyan-300/20 bg-slate-950/86 px-4 py-2 text-xs font-medium text-cyan-100 shadow-lg backdrop-blur-sm">
            {permissionMessage || fallbackMessage}
          </div>
        </div>
      ) : null}
    </div>
  );
}
