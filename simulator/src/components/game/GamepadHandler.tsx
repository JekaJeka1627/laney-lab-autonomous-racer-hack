'use client';

import { useEffect } from 'react';
import { useGameStore } from '@/lib/stores/game-store';

const DEADZONE = 0.05;

/**
 * Polls the browser Gamepad API each animation frame and writes directly to
 * the unified input store. When a gamepad is connected it owns all driving
 * input; KeyboardHandler defers to it.
 *
 * Standard gamepad mapping (Chrome/Edge, Xbox + PS):
 *   axes[0]    — left stick X: -1 (left) … 1 (right)  → steering (negated for car convention)
 *   buttons[7] — RT / R2:      0 … 1                   → throttle
 *   buttons[6] — LT / L2:      0 … 1                   → brake
 *   buttons[9] — Start / Options                        → pause / resume
 *
 * Raw mapping fallback (Firefox / Linux):
 *   axes[5]    — right trigger: -1 (released) … 1 (pressed) → throttle
 *   axes[4]    — left trigger:  -1 (released) … 1 (pressed) → brake
 */
export function GamepadHandler() {
  useEffect(() => {
    let rafId: number;

    // Firefox will not populate getGamepads() unless a gamepadconnected listener
    // is registered. The listener itself does nothing — the poll manages all state.
    function noop() {}
    window.addEventListener('gamepadconnected', noop);
    window.addEventListener('gamepaddisconnected', noop);

    function poll() {
      const store = useGameStore.getState();
      // Use the first *connected* gamepad. Firefox retains stale gamepad objects
      // in the array after disconnection with connected=false, so we must filter.
      const gp = Array.from(navigator.getGamepads()).find(g => g?.connected) ?? null;

      if (gp) {
        // Polling is intentional — gamepadconnected events are unreliable across browsers.
        // Update device flag directly from poll — avoids gamepadconnected event timing gaps
        if (store.activeInputDevice !== 'gamepad') store.setActiveInputDevice('gamepad');

        // Steer: negate axis so left stick left → steerTarget positive (left turn)
        const rawSteer = gp.axes[0] ?? 0;
        const steer = Math.abs(rawSteer) > DEADZONE ? -rawSteer : 0;

        // Triggers: standard mapping → buttons[6/7].value; raw mapping → axes[4/5]
        const isStandard = gp.mapping === 'standard';
        const throttle = isStandard
          ? (gp.buttons[7]?.value ?? 0)
          : Math.max(0, ((gp.axes[5] ?? -1) + 1) / 2);
        const brakeVal = isStandard
          ? (gp.buttons[6]?.value ?? 0)
          : Math.max(0, ((gp.axes[4] ?? -1) + 1) / 2);

        store.setInput({ steer, throttle, brake: brakeVal > 0.1 });

        // Start / Options → pause / resume
        if (gp.buttons[9]?.pressed) {
          if (store.mode === 'driving') store.setMode('paused');
          else if (store.mode === 'paused') store.setMode('driving');
        }
      } else if (store.activeInputDevice === 'gamepad') {
        // Gamepad was connected but is no longer readable — clear state
        store.setActiveInputDevice('keyboard');
        store.setInput({ steer: 0, throttle: 0, brake: false });
      }

      rafId = requestAnimationFrame(poll);
    }

    rafId = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('gamepadconnected', noop);
      window.removeEventListener('gamepaddisconnected', noop);
    };
  }, []);

  return null;
}
