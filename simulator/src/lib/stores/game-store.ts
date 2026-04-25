/**
 * Global game state — Zustand store.
 * Manages car state, lap tracking, XP, and run data capture.
 */
import { create } from 'zustand';
import { getStats } from '@/lib/data/training-data';

export interface CarState {
  x: number;
  z: number;
  rotation: number; // radians, 0 = facing +Z
  speed: number;
  steering: number; // -1 (left) to 1 (right) — actual ramped value
  throttle: number; // 0 to 1 — actual ramped value
  steerTarget: number; // -1 (left) to 1 (right) — desired target
  throttleTarget: number; // 0 to 1 — desired target
}

export interface LapRecord {
  lapNumber: number;
  timeMs: number;
  offTrackCount: number;
  collisions: number;
}

export interface ControlFrame {
  t: number; // ms since run start
  steering: number;
  throttle: number;
  speed: number;
  x: number;
  z: number;
  rotation: number;
}

interface GameState {
  // Game mode
  mode: 'menu' | 'pre-drive-guide' | 'driving' | 'paused' | 'replay' | 'autonomous' | 'auto-paused' | 'run-complete';
  trackId: string;
  driveMode: 'manual' | 'ai';
  pendingDriveMode: 'manual' | 'ai' | null;
  aiModelSelectionMode: 'active' | 'pinned';
  aiPinnedModelVersion: string | null;
  aiSteeringMode: 'learned' | 'waypoint';
  labRandomizationEnabled: boolean;
  trackVisualSeed: number;
  setTrackId: (id: string) => void;
  setMode: (mode: GameState['mode']) => void;
  setDriveMode: (dm: GameState['driveMode']) => void;
  setPendingDriveMode: (dm: GameState['pendingDriveMode']) => void;
  enterPreDriveGuide: (dm: GameState['driveMode']) => void;
  continueFromPreDriveGuide: () => void;
  backToMenuFromPreDriveGuide: () => void;
  setAiModelSelectionMode: (mode: 'active' | 'pinned') => void;
  setAiPinnedModelVersion: (version: string | null) => void;
  setAiSteeringMode: (mode: 'learned' | 'waypoint') => void;
  setLabRandomizationEnabled: (enabled: boolean) => void;
  setTrackVisualSeed: (seed: number) => void;

  // Car
  car: CarState;
  updateCar: (partial: Partial<CarState>) => void;

  // Unified directional input (written by KeyboardHandler, GamepadHandler, or TouchHandler)
  input: { steer: number; throttle: number; brake: boolean };
  setInput: (input: { steer: number; throttle: number; brake: boolean }) => void;
  // 'keyboard' is also the default/fallback — does not guarantee a physical keyboard is present.
  activeInputDevice: 'keyboard' | 'gamepad' | 'touch';
  setActiveInputDevice: (device: 'keyboard' | 'gamepad' | 'touch') => void;

  // Lap tracking
  currentLapStart: number;
  lapCount: number;
  laps: LapRecord[];
  bestLapMs: number | null;
  completeLap: () => void;
  resetLaps: () => void;

  // XP
  xp: number;
  addXp: (amount: number) => void;

  // Data capture
  controlLog: ControlFrame[];
  runStartTime: number;
  logControl: () => void;
  clearControlLog: () => void;

  // Off-track
  offTrack: boolean;
  setOffTrack: (v: boolean) => void;
  offTrackCount: number;

  // Speed limiter (0–100 percentage of MAX_SPEED)
  maxSpeedPct: number;
  setMaxSpeedPct: (pct: number) => void;

  // Timer
  elapsedMs: number;
  setElapsedMs: (ms: number) => void;

  // Celebration
  celebrationActive: boolean;
  setCelebrationActive: (active: boolean) => void;
}

function loadSavedStats() {
  if (typeof window === 'undefined') return { laps: 0, xp: 0 };
  const stats = getStats();
  return {
    laps: stats.totalLaps,
    xp: stats.totalLaps * 50, // base XP approximation
  };
}

function loadLabRandomizationEnabled() {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem('deepracer-lab-randomization');
  return raw == null ? true : raw === 'true';
}

const saved = loadSavedStats();

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'menu',
  trackId: 'oval',
  driveMode: 'manual',
  pendingDriveMode: null,
  aiModelSelectionMode: 'active',
  aiPinnedModelVersion: null,
  aiSteeringMode: 'learned',
  labRandomizationEnabled: loadLabRandomizationEnabled(),
  trackVisualSeed: 0,
  setTrackId: (id) => set({ trackId: id }),
  setMode: (mode) => set({ mode }),
  setDriveMode: (dm) => set({ driveMode: dm }),
  setPendingDriveMode: (pendingDriveMode) => set({ pendingDriveMode }),
  enterPreDriveGuide: (pendingDriveMode) => set((s) => {
    if (s.mode === 'pre-drive-guide' && s.pendingDriveMode === pendingDriveMode) return s;
    return { mode: 'pre-drive-guide', pendingDriveMode };
  }),
  continueFromPreDriveGuide: () => set((s) => {
    if (s.mode !== 'pre-drive-guide') return s;
    if (s.pendingDriveMode === 'manual') {
      return { mode: 'driving', driveMode: 'manual', pendingDriveMode: null };
    }
    if (s.pendingDriveMode === 'ai') {
      return { mode: 'autonomous', driveMode: 'ai', pendingDriveMode: null };
    }
    return { mode: 'menu', pendingDriveMode: null };
  }),
  backToMenuFromPreDriveGuide: () => set((s) => {
    if (s.mode !== 'pre-drive-guide') return s;
    return { mode: 'menu' };
  }),
  setAiModelSelectionMode: (aiModelSelectionMode) => set({ aiModelSelectionMode }),
  setAiPinnedModelVersion: (aiPinnedModelVersion) => set({ aiPinnedModelVersion }),
  setAiSteeringMode: (aiSteeringMode) => set({ aiSteeringMode }),
  setLabRandomizationEnabled: (labRandomizationEnabled) => {
    set({ labRandomizationEnabled });
    if (typeof window !== 'undefined') {
      localStorage.setItem('deepracer-lab-randomization', String(labRandomizationEnabled));
    }
  },
  setTrackVisualSeed: (trackVisualSeed) => set({ trackVisualSeed }),

  car: { x: 30, z: 0, rotation: Math.PI / 2, speed: 0, steering: 0, throttle: 0, steerTarget: 0, throttleTarget: 0 },
  updateCar: (partial) => set((s) => ({ car: { ...s.car, ...partial } })),

  input: { steer: 0, throttle: 0, brake: false },
  setInput: (input) => set({ input }),
  activeInputDevice: 'keyboard',
  setActiveInputDevice: (activeInputDevice) => set({ activeInputDevice }),

  currentLapStart: 0,
  lapCount: saved.laps,
  laps: [],
  bestLapMs: null,
  completeLap: () => {
    const now = performance.now();
    const s = get();
    const timeMs = now - s.currentLapStart;
    if (timeMs < 2000) return; // ignore micro-laps
    const lap: LapRecord = {
      lapNumber: s.lapCount + 1,
      timeMs,
      offTrackCount: s.offTrackCount,
      collisions: 0,
    };
    const best = s.bestLapMs === null ? timeMs : Math.min(s.bestLapMs, timeMs);
    // XP: base 50 + bonus for clean lap
    const xpGain = 50 + (s.offTrackCount === 0 ? 25 : 0);
    set({
      lapCount: s.lapCount + 1,
      laps: [...s.laps, lap],
      bestLapMs: best,
      currentLapStart: now,
      offTrackCount: 0,
      xp: s.xp + xpGain,
    });
    // Trigger celebration
    get().setCelebrationActive(true);
  },
  resetLaps: () => set({ lapCount: 0, laps: [], bestLapMs: null, currentLapStart: performance.now(), offTrackCount: 0 }),

  xp: saved.xp,
  addXp: (amount) => set((s) => ({ xp: s.xp + amount })),

  controlLog: [],
  runStartTime: 0,
  logControl: () => {
    const s = get();
    const t = performance.now() - s.runStartTime;
    const frame: ControlFrame = {
      t,
      steering: s.car.steering,
      throttle: s.car.throttle,
      speed: s.car.speed,
      x: s.car.x,
      z: s.car.z,
      rotation: s.car.rotation,
    };
    set({ controlLog: [...s.controlLog, frame] });
  },
  clearControlLog: () => set({ controlLog: [], runStartTime: performance.now() }),

  offTrack: false,
  setOffTrack: (v) => {
    const s = get();
    if (v && !s.offTrack) {
      set({ offTrack: true, offTrackCount: s.offTrackCount + 1 });
    } else if (!v) {
      set({ offTrack: false });
    }
  },
  offTrackCount: 0,

  maxSpeedPct: 60,
  setMaxSpeedPct: (pct) => {
    set({ maxSpeedPct: pct });
    if (typeof window !== 'undefined') {
      localStorage.setItem('deepracer-max-speed', String(pct));
    }
  },

  elapsedMs: 0,
  setElapsedMs: (ms) => set({ elapsedMs: ms }),

  celebrationActive: false,
  setCelebrationActive: (active) => set({ celebrationActive: active }),
}));
