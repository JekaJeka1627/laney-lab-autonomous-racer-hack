import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Home from './page';
import { KeyboardHandler } from '@/components/game/KeyboardHandler';
import { useGameStore } from '@/lib/stores/game-store';

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="game-scene-mock" />,
}));

describe('Home transition route boundary', () => {
  const baseState = useGameStore.getState();

  beforeEach(() => {
    useGameStore.setState({
      ...baseState,
      mode: 'pre-drive-guide',
      trackId: 'oval',
      pendingDriveMode: 'manual',
      gamepadConnected: false,
    });
  });

  it('renders transition route instead of menu', () => {
    render(<Home />);
    expect(screen.queryByText('Deep Racer')).not.toBeInTheDocument();
    expect(screen.getByText('Ready to drive?')).toBeInTheDocument();
    expect(screen.getByText(/Enter\/Space to continue, Esc to go back/i)).toBeInTheDocument();
  });
});

describe('KeyboardHandler in pre-drive-guide mode', () => {
  const baseState = useGameStore.getState();

  beforeEach(() => {
    useGameStore.setState({
      ...baseState,
      mode: 'pre-drive-guide',
      pendingDriveMode: 'manual',
      gamepadConnected: false,
      input: { steer: 0, throttle: 0, brake: false },
    });
  });

  it('does not toggle active-run pause states in transition mode', () => {
    render(<KeyboardHandler />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: ' ' });

    const state = useGameStore.getState();
    expect(state.mode).toBe('pre-drive-guide');
    expect(state.mode).not.toBe('paused');
    expect(state.mode).not.toBe('auto-paused');
  });
});
