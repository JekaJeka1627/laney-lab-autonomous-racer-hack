'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/stores/game-store';

const BAR_HEIGHT = 140;
const THUMB_H = 14;
const MIN_PCT = 10;
const MAX_PCT = 100;

/**
 * Vertical speed limiter slider — drag the thumb to set max speed.
 * Persists to localStorage. Shows km/h label.
 */
export function SpeedLimiter() {
  const maxSpeedPct = useGameStore((s) => s.maxSpeedPct);
  const setMaxSpeedPct = useGameStore((s) => s.setMaxSpeedPct);
  const driveMode = useGameStore((s) => s.driveMode);
  const mode = useGameStore((s) => s.mode);

  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('deepracer-max-speed');
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= MIN_PCT && val <= MAX_PCT) {
        setMaxSpeedPct(val);
      }
    }
  }, [setMaxSpeedPct]);

  const pctToY = (pct: number) => {
    // 100% = top (y=0), MIN_PCT = bottom (y=BAR_HEIGHT)
    return BAR_HEIGHT - ((pct - MIN_PCT) / (MAX_PCT - MIN_PCT)) * BAR_HEIGHT;
  };

  const yToPct = (y: number) => {
    const clamped = Math.max(0, Math.min(BAR_HEIGHT, y));
    return Math.round(MIN_PCT + ((BAR_HEIGHT - clamped) / BAR_HEIGHT) * (MAX_PCT - MIN_PCT));
  };

  const handleMove = useCallback(
    (clientY: number) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const y = clientY - rect.top;
      setMaxSpeedPct(yToPct(y));
    },
    [setMaxSpeedPct],
  );

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientY);
    };
    const onUp = () => setDragging(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, handleMove]);

  // Only show during active driving/autonomous modes
  const visible = mode === 'driving' || mode === 'autonomous' || mode === 'auto-paused' || mode === 'paused';
  if (!visible) return null;

  const thumbY = pctToY(maxSpeedPct);
  const fillHeight = BAR_HEIGHT - thumbY;
  const maxKmh = Math.round((25 * maxSpeedPct) / 100 * 3.6);

  return (
    <div className="absolute left-4 bottom-20 z-20 pointer-events-auto select-none">
      <div className="flex flex-col items-center gap-1">
        {/* Label */}
        <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-1">
          Max
        </div>

        {/* Speed value */}
        <div className="text-xs font-bold text-white font-mono w-10 text-center">
          {maxKmh}
        </div>
        <div className="text-[9px] text-gray-500">km/h</div>

        {/* Vertical bar */}
        <div
          ref={barRef}
          className="relative w-6 rounded-full bg-gray-800 border border-gray-600 cursor-pointer"
          style={{ height: BAR_HEIGHT }}
          onMouseDown={(e) => {
            setDragging(true);
            handleMove(e.clientY);
          }}
          onTouchStart={(e) => {
            setDragging(true);
            handleMove(e.touches[0].clientY);
          }}
        >
          {/* Fill */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-75"
            style={{
              height: fillHeight,
              background: maxSpeedPct > 75
                ? 'linear-gradient(to top, #ef4444, #f59e0b)'
                : maxSpeedPct > 40
                  ? 'linear-gradient(to top, #f59e0b, #22c55e)'
                  : 'linear-gradient(to top, #22c55e, #22c55e)',
            }}
          />

          {/* Thumb */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-8 rounded-full bg-white shadow-lg border-2 border-gray-300 transition-all duration-75"
            style={{
              height: THUMB_H,
              top: thumbY - THUMB_H / 2,
            }}
          />

          {/* Tick marks */}
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute left-0 right-0 border-t border-gray-600/50"
              style={{ top: pctToY(pct) }}
            />
          ))}
        </div>

        {/* Percentage */}
        <div className="text-[10px] text-gray-500 mt-1">
          {maxSpeedPct}%
        </div>
      </div>
    </div>
  );
}
