'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameStore } from '@/lib/stores/game-store';
import { backToMenuFromPreDriveGuide, continueFromPreDriveGuide } from '@/lib/tracks/start-run';

const STORAGE_KEY = 'preDriveGuide:hidden';

function getStoragePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function PreDriveGuide() {
  const trackId = useGameStore((s) => s.trackId);
  const pendingDriveMode = useGameStore((s) => s.pendingDriveMode);
  const continueButtonRef = useRef<HTMLButtonElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(getStoragePreference);

  const displayTrack = trackId.toLowerCase();
  const displayMode = (pendingDriveMode ?? 'manual').toLowerCase();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => {
      mediaQuery.removeEventListener('change', onChange);
    };
  }, []);

  useEffect(() => {
    continueButtonRef.current?.focus();
  }, []);

  const handleDontShowAgainChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDontShowAgain(e.target.checked);
  }, []);

  const handleContinue = useCallback(() => {
    if (dontShowAgain) {
      try {
        localStorage.setItem('preDriveGuide:hidden', 'true');
      } catch {
        // localStorage unavailable - graceful degradation
      }
    }
    continueFromPreDriveGuide();
  }, [dontShowAgain]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        backToMenuFromPreDriveGuide();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleContinue();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleContinue]);

  return (
    <div className="min-h-screen bg-[#0B0E1C] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-2xl border border-[#1E2540] bg-[#121629] shadow-2xl p-10 md:p-12 space-y-6">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#636E95] font-semibold">PRE-DRIVE CHECK</p>
          <h2 className="text-4xl font-bold text-white">Ready to drive?</h2>
        </div>

        <div className="rounded-xl border border-[#242B45] bg-[#1A2036] p-5 space-y-1">
          <p className="text-sm text-[#8A94AD]">
            Track: <strong className="text-white font-bold">{displayTrack}</strong>
          </p>
          <p className="text-sm text-[#8A94AD]">
            Mode: <strong className="text-white font-bold">{displayMode}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-[#242B45] bg-[#1A2036] p-5">
          <p className="text-sm text-[#4FD1C5]">Every lap helps the AI learn to drive better</p>
        </div>

        <div className="rounded-xl border border-[#242B45] bg-[#1A2036] p-5 space-y-4">
          <p className="text-[10px] font-bold text-[#636E95] tracking-widest uppercase">CONTROLS</p>
          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
            <div className="flex items-center gap-3">
              <kbd className="px-2 py-0.5 rounded bg-[#2D3748] text-[#A0AEC0] text-[10px] font-bold border border-[#3A4556]">WASD</kbd>
              <span className="text-[#E2E8F0]">Move</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className="px-2 py-0.5 rounded bg-[#2D3748] text-[#A0AEC0] text-[10px] font-bold border border-[#3A4556]">Space</kbd>
              <span className="text-[#E2E8F0]">Brake</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className="px-2 py-0.5 rounded bg-[#2D3748] text-[#A0AEC0] text-[10px] font-bold border border-[#3A4556]">Shift</kbd>
              <span className="text-[#E2E8F0]">Boost</span>
            </div>
            <div className="flex items-center gap-3">
              <kbd className="px-2 py-0.5 rounded bg-[#2D3748] text-[#A0AEC0] text-[10px] font-bold border border-[#3A4556]">ESC</kbd>
              <span className="text-[#E2E8F0]">Pause</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-[#8A94AD]" data-testid="loading-cue">
          <span
            className={[
              'inline-flex w-2.5 h-2.5 rounded-full bg-[#00CFE8]',
              reducedMotion ? '' : 'animate-pulse',
            ].join(' ').trim()}
            aria-hidden="true"
          />
          <span>Preparing race environment...</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <button
            type="button"
            ref={continueButtonRef}
            onClick={handleContinue}
            className="px-8 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121629]"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={backToMenuFromPreDriveGuide}
            className="px-6 py-3.5 rounded-xl border border-[#2D3748] hover:bg-white/5 text-white font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121629]"
          >
            Back to Menu
          </button>
        </div>

        <div className="space-y-4 pt-2">
          <label className="flex items-center gap-3 text-sm text-[#8A94AD] cursor-pointer group">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={handleDontShowAgainChange}
              className="w-4 h-4 rounded bg-transparent border-[#2D3748] text-blue-600 focus:ring-blue-500 focus:ring-offset-[#121629]"
            />
            <span className="group-hover:text-white transition-colors">Don&apos;t show again</span>
          </label>

          <div className="text-[11px] text-[#636E95] border-t border-[#1E2540] pt-4">
            <span className="font-bold">Keys:</span> Enter/Space to continue, Esc to go back
          </div>
        </div>
      </div>
    </div>
  );
}
