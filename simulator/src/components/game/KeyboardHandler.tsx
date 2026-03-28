'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/lib/stores/game-store';

/**
 * Captures keyboard input and updates the game store.
 * Also handles ESC for pause/resume.
 */
export function KeyboardHandler() {
  useEffect(() => {
    const controlMap: Partial<Record<string, 'left' | 'right' | 'accelerate' | 'brake'>> = {
      ArrowLeft: 'left',
      a: 'left',
      A: 'left',
      ArrowRight: 'right',
      d: 'right',
      D: 'right',
      ArrowUp: 'accelerate',
      w: 'accelerate',
      W: 'accelerate',
      ArrowDown: 'brake',
      s: 'brake',
      S: 'brake',
      ' ': 'brake',
    };

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
        // In manual mode, fall through so Car3D sees it as a key
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

      store.setKey(e.key, true);
      const mappedControl = controlMap[e.key];
      if (mappedControl) {
        store.setManualControl(mappedControl, true);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const store = useGameStore.getState();
      store.setKey(e.key, false);
      const mappedControl = controlMap[e.key];
      if (mappedControl) {
        store.setManualControl(mappedControl, false);
      }
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
