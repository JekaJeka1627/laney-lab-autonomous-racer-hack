'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/lib/stores/game-store';

/**
 * Captures keyboard input and updates the game store.
 * Also handles ESC for pause/resume.
 */
export function KeyboardHandler() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const store = useGameStore.getState();

      if (e.key === 'Escape') {
        if (store.mode === 'driving') store.setMode('paused');
        else if (store.mode === 'paused') store.setMode('driving');
        return;
      }

      // Prevent arrow keys from scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      store.setKey(e.key, true);
    }

    function onKeyUp(e: KeyboardEvent) {
      useGameStore.getState().setKey(e.key, false);
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
