import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TrackSelect } from './TrackSelect';
import { useGameStore } from '@/lib/stores/game-store';

vi.mock('@/lib/api/api-client', () => ({
  isApiConfigured: vi.fn(() => false),
  getRemoteRunsSummary: vi.fn(),
}));

vi.mock('@/lib/data/training-data', () => ({
  getStats: vi.fn(() => ({ totalRuns: 0, totalLaps: 0, totalFrames: 0 })),
}));

describe('TrackSelect transition gate', () => {
  const baseState = useGameStore.getState();

  beforeEach(() => {
    useGameStore.setState({
      ...baseState,
      mode: 'menu',
      trackId: 'oval',
      driveMode: 'manual',
      pendingDriveMode: null,
      lapCount: 200,
      laps: [],
      controlLog: [],
    });
  });

  it('manual start enters transition, not driving', () => {
    render(<TrackSelect />);
    const card = screen.getByText('Oval').closest('[role="button"]');
    expect(card).toBeTruthy();
    fireEvent.click(card!);

    const state = useGameStore.getState();
    expect(state.mode).toBe('pre-drive-guide');
    expect(state.pendingDriveMode).toBe('manual');
    expect(state.mode).not.toBe('driving');
  });

  it('ai start enters transition, not autonomous', () => {
    render(<TrackSelect />);
    fireEvent.click(screen.getAllByTitle('Watch AI drive')[0]);

    const state = useGameStore.getState();
    expect(state.mode).toBe('pre-drive-guide');
    expect(state.pendingDriveMode).toBe('ai');
    expect(state.mode).not.toBe('autonomous');
  });

  it('rapid repeated starts do not duplicate transition side effects', () => {
    render(<TrackSelect />);
    const before = useGameStore.getState().runStartTime;
    const card = screen.getByText('Oval').closest('[role="button"]');
    fireEvent.click(card!);
    fireEvent.click(card!);

    const state = useGameStore.getState();
    expect(state.mode).toBe('pre-drive-guide');
    expect(state.pendingDriveMode).toBe('manual');
    expect(state.runStartTime).toBe(before);
  });

  it('back action returns to menu and preserves selection context', () => {
    render(<TrackSelect />);
    fireEvent.click(screen.getAllByTitle('Watch AI drive')[0]);
    useGameStore.getState().backToMenuFromPreDriveGuide();

    const state = useGameStore.getState();
    expect(state.mode).toBe('menu');
    expect(state.trackId).toBe('oval');
    expect(state.pendingDriveMode).toBe('ai');
  });

  it('skips guide when preference is set in localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('true');
    render(<TrackSelect />);
    const card = screen.getByText('Oval').closest('[role="button"]');
    fireEvent.click(card!);

    const state = useGameStore.getState();
    expect(state.mode).toBe('driving');
    vi.restoreAllMocks();
  });
});
