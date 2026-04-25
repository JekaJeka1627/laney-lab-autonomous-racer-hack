'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/stores/game-store';

const RADIUS = 70; // joystick radius in px

interface JoystickVisual {
  baseX: number;
  baseY: number;
  knobX: number;
  knobY: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Virtual joystick for touchscreen input.
 * Appears where the user touches, disappears on lift.
 * X axis → steering, Y axis → throttle (up) / brake (down).
 * Writes to the unified store.input; gamepad takes priority if connected.
 */
export function TouchHandler() {
  const [joystick, setJoystick] = useState<JoystickVisual | null>(null);
  const activeTouchId = useRef<number | null>(null);
  const baseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      // Only active during manual driving
      const store = useGameStore.getState();
      if (store.mode !== 'driving' && store.mode !== 'paused') return;
      if (store.activeInputDevice === 'gamepad') return;
      if (activeTouchId.current !== null) return;

      // Don't hijack taps on UI buttons / overlays
      const target = e.target as Element;
      if (target.closest('button, a, [role="button"]')) return;

      const touch = e.changedTouches[0];
      activeTouchId.current = touch.identifier;
      baseRef.current = { x: touch.clientX, y: touch.clientY };

      useGameStore.getState().setActiveInputDevice('touch');
      useGameStore.getState().setInput({ steer: 0, throttle: 0, brake: false });

      setJoystick({ baseX: touch.clientX, baseY: touch.clientY, knobX: touch.clientX, knobY: touch.clientY });
    }

    function onTouchMove(e: TouchEvent) {
      if (activeTouchId.current === null) return;
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId.current);
      if (!touch || !baseRef.current) return;
      e.preventDefault();

      const base = baseRef.current;
      const dx = touch.clientX - base.x;
      const dy = touch.clientY - base.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist > RADIUS ? RADIUS / dist : 1;
      const cdx = dx * scale;
      const cdy = dy * scale;

      // Compute and write input outside the state updater to avoid setState-during-render
      const steer = clamp(-cdx / RADIUS, -1, 1);
      const throttle = cdy < 0 ? clamp(-cdy / RADIUS, 0, 1) : 0;
      const brake = cdy > RADIUS * 0.3; // brake when pushed >30% down from center
      useGameStore.getState().setInput({ steer, throttle, brake });

      // Update knob position separately
      setJoystick(prev => prev ? { ...prev, knobX: base.x + cdx, knobY: base.y + cdy } : prev);
    }

    function onTouchEnd(e: TouchEvent) {
      if (activeTouchId.current === null) return;
      const touch = Array.from(e.changedTouches).find(t => t.identifier === activeTouchId.current);

      // On touchcancel, some browsers omit the identifier from changedTouches.
      // Force-reset regardless so the joystick never gets stuck.
      if (!touch && e.type !== 'touchcancel') return;

      activeTouchId.current = null;
      baseRef.current = null;
      const store = useGameStore.getState();
      // Only reclaim keyboard if touch still owns input — gamepad may have taken over mid-touch
      const next = navigator.getGamepads().some(g => g?.connected) ? 'gamepad' : 'keyboard';
      store.setActiveInputDevice(next);
      store.setInput({ steer: 0, throttle: 0, brake: false });
      setJoystick(null);
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  if (!joystick) return null;

  const knobSize = RADIUS * 0.55;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Base ring */}
      <div
        className="absolute rounded-full border-2 border-white/30 bg-white/10"
        style={{
          width: RADIUS * 2,
          height: RADIUS * 2,
          left: joystick.baseX - RADIUS,
          top: joystick.baseY - RADIUS,
        }}
      />
      {/* Knob */}
      <div
        className="absolute rounded-full bg-white/50"
        style={{
          width: knobSize,
          height: knobSize,
          left: joystick.knobX - knobSize / 2,
          top: joystick.knobY - knobSize / 2,
        }}
      />
    </div>
  );
}
