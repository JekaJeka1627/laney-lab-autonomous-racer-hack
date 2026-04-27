import { useGameStore } from '@/lib/stores/game-store';
import { TRACKS } from '@/lib/tracks/track-data';

const GUIDE_STORAGE_KEY = 'preDriveGuide:hidden';

function shouldSkipPreDriveGuide(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(GUIDE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

let trackVisualSeedCounter = 1;

function nextTrackVisualSeed(): number {
  trackVisualSeedCounter = (trackVisualSeedCounter + 1) & 0x7fffffff;
  if (trackVisualSeedCounter === 0) trackVisualSeedCounter = 1;
  return trackVisualSeedCounter;
}

function initTrack(trackId: string, labRandomizationEnabled: boolean) {
  const store = useGameStore.getState();
  store.setTrackId(trackId);
  store.resetLaps();
  store.clearControlLog();

  const track = TRACKS.find((t) => t.id === trackId);
  if (!track) {
    store.setMode('menu');
    return false;
  }

  const visualSeed = (track.environment === 'lab' && labRandomizationEnabled)
    ? nextTrackVisualSeed()
    : 0;
  store.setTrackVisualSeed(visualSeed);
  store.updateCar({
    x: track.spawnPos[0],
    z: track.spawnPos[2],
    rotation: track.spawnRotation,
    speed: 0,
    steering: 0,
    throttle: 0,
  });
  return true;
}

export function enterPreDriveGuide(trackId: string, driveMode: 'manual' | 'ai') {
  const store = useGameStore.getState();
  const trackExists = TRACKS.some((t) => t.id === trackId);
  if (!trackExists) {
    store.setMode('menu');
    return;
  }

  if (shouldSkipPreDriveGuide()) {
    store.setTrackId(trackId);
    store.enterPreDriveGuide(driveMode);
    const ok = initTrack(trackId, store.labRandomizationEnabled);
    if (!ok) return;
    store.continueFromPreDriveGuide();
    return;
  }

  store.setTrackId(trackId);
  store.enterPreDriveGuide(driveMode);
}

export function continueFromPreDriveGuide() {
  const store = useGameStore.getState();
  if (store.mode !== 'pre-drive-guide') return;
  if (!store.pendingDriveMode) {
    store.continueFromPreDriveGuide();
    return;
  }
  const ok = initTrack(store.trackId, store.labRandomizationEnabled);
  if (!ok) return;
  store.continueFromPreDriveGuide();
}

export function backToMenuFromPreDriveGuide() {
  const store = useGameStore.getState();
  if (store.mode !== 'pre-drive-guide') return;
  store.backToMenuFromPreDriveGuide();
}
