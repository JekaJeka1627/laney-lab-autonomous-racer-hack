import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './game-store';

describe('game-store pre-drive transition', () => {
  const baseState = useGameStore.getState();

  beforeEach(() => {
    useGameStore.setState({
      ...baseState,
      mode: 'menu',
      driveMode: 'manual',
      pendingDriveMode: null,
      trackId: 'oval',
    });
  });

  it('supports pre-drive-guide mode value', () => {
    useGameStore.getState().setMode('pre-drive-guide');
    expect(useGameStore.getState().mode).toBe('pre-drive-guide');
  });

  it('stores intended target on transition entry', () => {
    useGameStore.getState().enterPreDriveGuide('ai');
    const state = useGameStore.getState();
    expect(state.mode).toBe('pre-drive-guide');
    expect(state.pendingDriveMode).toBe('ai');
  });

  it('falls back to menu if continue missing target', () => {
    useGameStore.setState({ mode: 'pre-drive-guide', pendingDriveMode: null });
    useGameStore.getState().continueFromPreDriveGuide();
    expect(useGameStore.getState().mode).toBe('menu');
  });

  it('ignores continue action outside transition', () => {
    useGameStore.setState({ mode: 'driving', pendingDriveMode: 'manual' });
    useGameStore.getState().continueFromPreDriveGuide();
    const state = useGameStore.getState();
    expect(state.mode).toBe('driving');
    expect(state.pendingDriveMode).toBe('manual');
  });
});
