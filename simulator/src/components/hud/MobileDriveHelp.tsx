'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/lib/stores/game-store';
import { useDeviceOrientation } from '@/lib/hooks/useDeviceOrientation';
import { useIsCoarsePointer } from '@/lib/hooks/useIsCoarsePointer';

const STORAGE_KEY = 'deepracer-mobile-help-dismissed';

export function MobileDriveHelp() {
  const mode = useGameStore((s) => s.mode);
  const driveMode = useGameStore((s) => s.driveMode);
  const controlScheme = useGameStore((s) => s.controlScheme);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);
  const setControlScheme = useGameStore((s) => s.setControlScheme);
  const isCoarsePointer = useIsCoarsePointer();
  const { supported, requestPermission } = useDeviceOrientation();
  const [dismissed, setDismissed] = useState(() =>
    typeof window === 'undefined' ? true : localStorage.getItem(STORAGE_KEY) === 'true',
  );
  const [schemeMessage, setSchemeMessage] = useState<string | null>(null);

  const requiresPermission = useMemo(() => {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    return typeof orientationEvent.requestPermission === 'function';
  }, []);

  useEffect(() => {
    if (!supported && controlScheme === 'tilt') {
      setControlScheme('buttons');
    }
  }, [controlScheme, setControlScheme, supported]);

  const fallbackMessage = !supported && controlScheme !== 'tilt'
    ? 'Tilt steering is unavailable on this device. Button controls are enabled.'
    : null;

  if (
    !isCoarsePointer ||
    gamepadConnected ||
    dismissed ||
    driveMode !== 'manual' ||
    (mode !== 'driving' && mode !== 'paused')
  ) {
    return null;
  }

  async function selectScheme(nextScheme: 'buttons' | 'tilt') {
    if (nextScheme === 'tilt') {
      if (!supported) return;
      if (requiresPermission) {
        const granted = await requestPermission();
        if (!granted) {
          setControlScheme('buttons');
          setSchemeMessage('Motion access was denied. Button controls are still available.');
          return;
        }
      }
    }

    setSchemeMessage(null);
    setControlScheme(nextScheme);
  }

  return (
    <div className="pointer-events-none absolute inset-x-3 top-20 z-40 sm:inset-x-auto sm:right-4 sm:w-[320px]">
      <div className="pointer-events-auto rounded-3xl border border-cyan-400/30 bg-slate-950/88 p-4 text-white shadow-2xl backdrop-blur-md">
        <div className="text-[11px] uppercase tracking-[0.22em] text-cyan-300">Mobile driving</div>
        <h2 className="mt-2 text-lg font-semibold">Choose your controls</h2>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void selectScheme('tilt')}
            disabled={!supported}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              controlScheme === 'tilt'
                ? 'bg-cyan-300 text-slate-950'
                : supported
                  ? 'border border-cyan-300/35 bg-slate-900/70 text-cyan-100'
                  : 'border border-slate-700 bg-slate-900/50 text-slate-500'
            }`}
          >
            Tilt steering
          </button>
          <button
            type="button"
            onClick={() => void selectScheme('buttons')}
            className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
              controlScheme === 'buttons'
                ? 'bg-cyan-300 text-slate-950'
                : 'border border-cyan-300/35 bg-slate-900/70 text-cyan-100'
            }`}
          >
            Button controls
          </button>
        </div>
        <div className="mt-2 space-y-1 text-sm text-slate-300">
          {controlScheme === 'tilt' ? (
            <>
              <p>Tilt your device to steer. Use Calibrate to reset the center angle.</p>
              <p>Right side of the screen controls gas. Slide higher for more throttle.</p>
              <p>Tap the left side to brake. Pause, restart, and end-run stay centered.</p>
            </>
          ) : (
            <>
              <p>Left side steers. Right side controls gas and brake.</p>
              <p>Pause, restart, and end-run buttons stay centered above the controls.</p>
            </>
          )}
          <p>Landscape works best on phones and tablets.</p>
          {!supported ? <p className="text-amber-300">Tilt steering is unavailable because this device does not expose motion sensors.</p> : null}
          {requiresPermission && controlScheme === 'tilt' ? <p className="text-cyan-200">Tilt mode may ask for motion permission before steering starts.</p> : null}
          {schemeMessage ? <p className="text-cyan-200">{schemeMessage}</p> : null}
          {fallbackMessage ? <p className="text-cyan-200">{fallbackMessage}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, 'true');
            setDismissed(true);
          }}
          className="mt-4 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 touch-manipulation"
        >
          Start driving
        </button>
      </div>
    </div>
  );
}
