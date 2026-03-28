'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const setManualControl = useGameStore((s) => s.setManualControl);
  const resetManualControls = useGameStore((s) => s.resetManualControls);
  const setAnalogSteer = useGameStore((s) => s.setAnalogSteer);
  const setAnalogThrottle = useGameStore((s) => s.setAnalogThrottle);
  const setMode = useGameStore((s) => s.setMode);
  const isCoarsePointer = useIsCoarsePointer();
  const {
    supported,
    permissionGranted,
    beta,
    gamma,
    requestPermission,
    calibrate,
    getCalibratedBeta,
    getCalibratedGamma,
  } = useDeviceOrientation();

  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);

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
      setAnalogThrottle(0);
      setManualControl('brake', false);
      return;
    }

    const steerRange = 28;
    const pitchRange = 18;
    const calibratedRoll = getCalibratedGamma();
    const calibratedPitch = getCalibratedBeta();

    const analogSteer = clamp(calibratedRoll / steerRange, -1, 1);
    const pitchIntent = clamp((-calibratedPitch) / pitchRange, -1, 1);

    setAnalogSteer(analogSteer);
    setAnalogThrottle(pitchIntent > 0 ? pitchIntent : 0);
    setManualControl('brake', pitchIntent < -0.2);
  }, [
    beta,
    controlScheme,
    gamma,
    getCalibratedBeta,
    getCalibratedGamma,
    isActive,
    permissionGranted,
    requiresPermission,
    setAnalogSteer,
    setAnalogThrottle,
    setManualControl,
    supported,
  ]);

  useEffect(() => {
    if (isActive && controlScheme === 'tilt') return;
    setAnalogSteer(0);
    setAnalogThrottle(0);
    setManualControl('brake', false);
  }, [controlScheme, isActive, setAnalogSteer, setAnalogThrottle, setManualControl]);

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
    setPermissionMessage('Tilt center updated. Lean forward for gas, back for brake.');
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      <div className="absolute inset-x-4 top-24 flex justify-center">
        <div className="rounded-full border border-cyan-300/20 bg-slate-950/86 px-4 py-2 text-xs font-medium text-cyan-100 shadow-lg backdrop-blur-sm">
          Tilt forward to accelerate, back to brake, left or right to steer.
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
        <div className="pointer-events-none absolute inset-x-4 top-40 flex justify-center">
          <div className="rounded-full border border-cyan-300/20 bg-slate-950/86 px-4 py-2 text-xs font-medium text-cyan-100 shadow-lg backdrop-blur-sm">
            {permissionMessage || fallbackMessage}
          </div>
        </div>
      ) : null}
    </div>
  );
}
