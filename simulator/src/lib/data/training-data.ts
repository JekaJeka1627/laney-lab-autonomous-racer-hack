/**
 * Training data persistence — saves driving runs to localStorage.
 * Each run captures: track, lap count, control frames, timestamps.
 * This accumulates across sessions and will later sync to the API.
 */

import type { ControlFrame } from '@/lib/stores/game-store';

export interface TrainingRun {
  id: string;
  trackId: string;
  driveMode: 'manual' | 'ai';
  lapCount: number;
  frames: number;
  bestLapMs: number | null;
  offTrackCount: number;
  durationMs: number;
  timestamp: string;
  controlLog: ControlFrame[];
}

const STORAGE_KEY = 'deepracer-training-runs';
const STATS_KEY = 'deepracer-stats';

export interface AccumulatedStats {
  totalRuns: number;
  totalLaps: number;
  totalFrames: number;
  totalDriveTimeMs: number;
  bestLapMs: number | null;
}

function getDefaultStats(): AccumulatedStats {
  return { totalRuns: 0, totalLaps: 0, totalFrames: 0, totalDriveTimeMs: 0, bestLapMs: null };
}

export function getStats(): AccumulatedStats {
  if (typeof window === 'undefined') return getDefaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : getDefaultStats();
  } catch {
    return getDefaultStats();
  }
}

export function getRuns(): TrainingRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRun(run: Omit<TrainingRun, 'id' | 'timestamp'>): TrainingRun {
  const fullRun: TrainingRun = {
    ...run,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  // Save run (keep last 100 runs with control logs, older ones get logs trimmed)
  const runs = getRuns();
  runs.push(fullRun);

  // Keep only last 100 full runs; older ones drop controlLog to save space
  if (runs.length > 100) {
    for (let i = 0; i < runs.length - 100; i++) {
      runs[i].controlLog = [];
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // Storage full — keep metadata but warn user
    const trimmed = runs.slice(-50).map(r => ({ ...r, controlLog: [] }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      console.warn('Storage full: control logs trimmed from older runs. Export data regularly to avoid loss.');
    } catch {
      const minimal = runs.slice(-10).map(r => ({ ...r, controlLog: [] }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
    }
  }

  // TODO: Replace localStorage with IndexedDB for larger storage capacity
  // TODO: Implement API upload (POST /api/runs/{id}/upload) — once available,
  //       uploaded runs should be cleared from local storage

  // Update accumulated stats
  const stats = getStats();
  stats.totalRuns += 1;
  stats.totalLaps += run.lapCount;
  stats.totalFrames += run.frames;
  stats.totalDriveTimeMs += run.durationMs;
  if (run.bestLapMs !== null) {
    stats.bestLapMs = stats.bestLapMs === null
      ? run.bestLapMs
      : Math.min(stats.bestLapMs, run.bestLapMs);
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));

  return fullRun;
}

export function exportRunsAsJSON(): string {
  const runs = getRuns();
  return JSON.stringify(runs, null, 2);
}

export function exportRunsAsCSV(): string {
  const runs = getRuns();
  const lines = ['id,trackId,driveMode,lapCount,frames,bestLapMs,durationMs,timestamp'];
  for (const r of runs) {
    lines.push(`${r.id},${r.trackId},${r.driveMode},${r.lapCount},${r.frames},${r.bestLapMs ?? ''},${r.durationMs},${r.timestamp}`);
  }
  return lines.join('\n');
}
