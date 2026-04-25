'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/lib/stores/game-store';

/**
 * Captures keyboard input and writes to the unified input store.
 * Skipped when a gamepad is connected (GamepadHandler owns input then).
 */
export function KeyboardHandler() {
  const keysRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    function computeInput() {
      const k = keysRef.current;
      const left  = k['ArrowLeft']  || k['a'] || k['A'];
      const right = k['ArrowRight'] || k['d'] || k['D'];
      const up    = k['ArrowUp']    || k['w'] || k['W'];
      const down  = k['ArrowDown']  || k['s'] || k['S'];
      const brake = k[' '] || down;
      return {
        steer:    left ? 1 : right ? -1 : 0,
        throttle: up   ? 1 : 0,
        brake:    !!brake,
      };
    }

    function onKeyDown(e: KeyboardEvent) {
      const store = useGameStore.getState();

      if (e.key === 'Escape') {
        if (store.mode === 'driving') store.setMode('paused');
        else if (store.mode === 'paused') store.setMode('driving');
        return;
      }

      // Space: toggles pause in autonomous mode, acts as brake key in manual
      if (e.key === ' ') {
        e.preventDefault();
        if (store.mode === 'autonomous') { store.setMode('auto-paused'); return; }
        if (store.mode === 'auto-paused') { store.setMode('autonomous'); return; }
      }

      // Number keys 1-5: snap throttleTarget to preset levels
      const presetMap: Record<string, number> = { '1': 0.2, '2': 0.4, '3': 0.6, '4': 0.8, '5': 1.0 };
      if (presetMap[e.key] !== undefined && (store.mode === 'driving' || store.mode === 'paused')) {
        store.updateCar({ throttleTarget: presetMap[e.key] });
      }

      // Prevent arrow keys and space from scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      keysRef.current[e.key] = true;
      if (store.activeInputDevice === 'keyboard') store.setInput(computeInput());
    }

    function onKeyUp(e: KeyboardEvent) {
      keysRef.current[e.key] = false;
      const store = useGameStore.getState();
      if (store.activeInputDevice === 'keyboard') store.setInput(computeInput());
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return null;
}
