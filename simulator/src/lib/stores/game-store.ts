/**
 * Global game state — Zustand store.
 * Manages car state, lap tracking, XP, and run data capture.
 */
import { create } from 'zustand';

export interface CarState {
  x: number;
  z: number;
  rotation: number; // radians, 0 = facing +Z
  speed: number;
  steering: number; // -1 (left) to 1 (right)
  throttle: number; // 0 to 1
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
  mode: 'menu' | 'driving' | 'paused' | 'replay';
  trackId: string;
  setTrackId: (id: string) => void;
  setMode: (mode: GameState['mode']) => void;

  // Car
  car: CarState;
  updateCar: (partial: Partial<CarState>) => void;

  // Input
  keys: Record<string, boolean>;
  setKey: (key: string, down: boolean) => void;

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

  // Timer
  elapsedMs: number;
  setElapsedMs: (ms: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'menu',
  trackId: 'oval',
  setTrackId: (id) => set({ trackId: id }),
  setMode: (mode) => set({ mode }),

  car: { x: 30, z: 0, rotation: Math.PI / 2, speed: 0, steering: 0, throttle: 0 },
  updateCar: (partial) => set((s) => ({ car: { ...s.car, ...partial } })),

  keys: {},
  setKey: (key, down) => set((s) => ({ keys: { ...s.keys, [key]: down } })),

  currentLapStart: 0,
  lapCount: 0,
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
  },
  resetLaps: () => set({ lapCount: 0, laps: [], bestLapMs: null, currentLapStart: performance.now(), offTrackCount: 0 }),

  xp: 0,
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

  elapsedMs: 0,
  setElapsedMs: (ms) => set({ elapsedMs: ms }),
}));
