/**
 * Global game state — Zustand store.
 * Manages car state, lap tracking, XP, and run data capture.
 */
import { create } from 'zustand';
import { getStats } from '@/lib/data/training-data';

export interface CarState {
  x: number;
  z: number;
  rotation: number;
  speed: number;
  steering: number;
  throttle: number;
  steerTarget: number;
  throttleTarget: number;
}

export interface LapRecord {
  lapNumber: number;
  timeMs: number;
  offTrackCount: number;
  collisions: number;
}

export interface ControlFrame {
  t: number;
  steering: number;
  throttle: number;
  speed: number;
  x: number;
  z: number;
  rotation: number;
}

interface GameState {
  mode: 'menu' | 'driving' | 'paused' | 'replay' | 'autonomous' | 'auto-paused' | 'run-complete';
  trackId: string;
  driveMode: 'manual' | 'ai';
  aiModelSelectionMode: 'active' | 'pinned';
  aiPinnedModelVersion: string | null;
  aiSteeringMode: 'learned' | 'waypoint';
  labRandomizationEnabled: boolean;
  trackVisualSeed: number;
  setTrackId: (id: string) => void;
  setMode: (mode: GameState['mode']) => void;
  setDriveMode: (dm: GameState['driveMode']) => void;
  setAiModelSelectionMode: (mode: 'active' | 'pinned') => void;
  setAiPinnedModelVersion: (version: string | null) => void;
  setAiSteeringMode: (mode: 'learned' | 'waypoint') => void;
  setLabRandomizationEnabled: (enabled: boolean) => void;
  setTrackVisualSeed: (seed: number) => void;

  car: CarState;
  updateCar: (partial: Partial<CarState>) => void;

  keys: Record<string, boolean>;
  setKey: (key: string, down: boolean) => void;
  manualControls: {
    left: boolean;
    right: boolean;
    accelerate: boolean;
    brake: boolean;
  };
  setManualControl: (control: 'left' | 'right' | 'accelerate' | 'brake', active: boolean) => void;
  resetManualControls: () => void;

  input: { steer: number; throttle: number; brake: boolean };
  setInput: (input: { steer: number; throttle: number; brake: boolean }) => void;
  gamepadConnected: boolean;
  setGamepadConnected: (connected: boolean) => void;

  controlScheme: 'buttons' | 'tilt';
  setControlScheme: (scheme: 'buttons' | 'tilt') => void;
  analogSteer: number;
  analogThrottle: number;
  setAnalogSteer: (value: number) => void;
  setAnalogThrottle: (value: number) => void;

  currentLapStart: number;
  lapCount: number;
  laps: LapRecord[];
  bestLapMs: number | null;
  completeLap: () => void;
  resetLaps: () => void;

  xp: number;
  addXp: (amount: number) => void;

  controlLog: ControlFrame[];
  runStartTime: number;
  logControl: () => void;
  clearControlLog: () => void;

  offTrack: boolean;
  setOffTrack: (v: boolean) => void;
  offTrackCount: number;

  maxSpeedPct: number;
  setMaxSpeedPct: (pct: number) => void;

  elapsedMs: number;
  setElapsedMs: (ms: number) => void;

  celebrationActive: boolean;
  setCelebrationActive: (active: boolean) => void;
}

function loadSavedStats() {
  if (typeof window === 'undefined') return { laps: 0, xp: 0 };
  const stats = getStats();
  return {
    laps: stats.totalLaps,
    xp: stats.totalLaps * 50,
  };
}

function loadLabRandomizationEnabled() {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem('deepracer-lab-randomization');
  return raw == null ? true : raw === 'true';
}

function detectDefaultControlScheme(): 'buttons' | 'tilt' {
  if (typeof window === 'undefined') return 'buttons';

  const userAgent = navigator.userAgent || navigator.vendor || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 1024;
  const mobilePattern = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const ipadOs = platform === 'MacIntel' && maxTouchPoints > 1;
  const likelyMobileOrTablet = coarsePointer && smallViewport && (mobilePattern.test(userAgent) || ipadOs);
  const tiltSupported = typeof DeviceOrientationEvent !== 'undefined';

  return likelyMobileOrTablet && tiltSupported ? 'tilt' : 'buttons';
}

function loadControlScheme(): 'buttons' | 'tilt' {
  if (typeof window === 'undefined') return 'buttons';
  const saved = localStorage.getItem('deepracer-control-scheme');
  if (saved === 'tilt' || saved === 'buttons') return saved;
  return detectDefaultControlScheme();
}

const saved = loadSavedStats();

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'menu',
  trackId: 'oval',
  driveMode: 'manual',
  aiModelSelectionMode: 'active',
  aiPinnedModelVersion: null,
  aiSteeringMode: 'learned',
  labRandomizationEnabled: loadLabRandomizationEnabled(),
  trackVisualSeed: 0,
  setTrackId: (id) => set({ trackId: id }),
  setMode: (mode) => set({ mode }),
  setDriveMode: (dm) => set({ driveMode: dm }),
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

  keys: {},
  setKey: (key, down) => set((s) => ({ keys: { ...s.keys, [key]: down } })),
  manualControls: { left: false, right: false, accelerate: false, brake: false },
  setManualControl: (control, active) =>
    set((s) => ({ manualControls: { ...s.manualControls, [control]: active } })),
  resetManualControls: () =>
    set({
      keys: {},
      manualControls: { left: false, right: false, accelerate: false, brake: false },
      input: { steer: 0, throttle: 0, brake: false },
      analogSteer: 0,
      analogThrottle: 0,
    }),

  input: { steer: 0, throttle: 0, brake: false },
  setInput: (input) => set({ input }),
  gamepadConnected: false,
  setGamepadConnected: (connected) => set({ gamepadConnected: connected }),

  controlScheme: loadControlScheme(),
  setControlScheme: (controlScheme) => {
    set({ controlScheme });
    if (typeof window !== 'undefined') {
      localStorage.setItem('deepracer-control-scheme', controlScheme);
    }
  },
  analogSteer: 0,
  analogThrottle: 0,
  setAnalogSteer: (analogSteer) => set({ analogSteer: Math.max(-1, Math.min(1, analogSteer)) }),
  setAnalogThrottle: (analogThrottle) => set({ analogThrottle: Math.max(0, Math.min(1, analogThrottle)) }),

  currentLapStart: 0,
  lapCount: saved.laps,
  laps: [],
  bestLapMs: null,
  completeLap: () => {
    const now = performance.now();
    const s = get();
    const timeMs = now - s.currentLapStart;
    if (timeMs < 2000) return;
    const lap: LapRecord = {
      lapNumber: s.lapCount + 1,
      timeMs,
      offTrackCount: s.offTrackCount,
      collisions: 0,
    };
    const best = s.bestLapMs === null ? timeMs : Math.min(s.bestLapMs, timeMs);
    const xpGain = 50 + (s.offTrackCount === 0 ? 25 : 0);
    set({
      lapCount: s.lapCount + 1,
      laps: [...s.laps, lap],
      bestLapMs: best,
      currentLapStart: now,
      offTrackCount: 0,
      xp: s.xp + xpGain,
    });
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
