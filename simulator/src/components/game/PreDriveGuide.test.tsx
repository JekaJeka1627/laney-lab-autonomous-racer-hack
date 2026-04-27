import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PreDriveGuide } from './PreDriveGuide';
import { useGameStore } from '@/lib/stores/game-store';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('PreDriveGuide shell', () => {
  const baseState = useGameStore.getState();

  beforeEach(() => {
    mockMatchMedia(false);
    useGameStore.setState({
      ...baseState,
      mode: 'pre-drive-guide',
      trackId: 'oval',
      pendingDriveMode: 'manual',
      gamepadConnected: false,
    });
  });

  it('shows actions and context anchors', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText('Ready to drive?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CONTINUE/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /BACK TO MENU/i })).toBeInTheDocument();
    expect(screen.getByText('Track:')).toBeInTheDocument();
    expect(screen.getByText('Mode:')).toBeInTheDocument();
  });

  it('shows keyboard hint row', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText(/Enter\/Space to continue, Esc to go back/i)).toBeInTheDocument();
  });

  it('shows lap contribution message', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText('Every lap helps the AI learn to drive better')).toBeInTheDocument();
  });

  it('shows movement controls', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText('WASD')).toBeInTheDocument();
    expect(screen.getByText('Move')).toBeInTheDocument();
  });

  it('shows brake control', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('Brake')).toBeInTheDocument();
  });

  it('shows boost control', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText('Shift')).toBeInTheDocument();
    expect(screen.getByText('Boost')).toBeInTheDocument();
  });

  it('shows pause control', () => {
    render(<PreDriveGuide />);
    expect(screen.getByText('ESC')).toBeInTheDocument();
    expect(screen.getByText('Pause')).toBeInTheDocument();
  });

  it('uses animated cue by default with no fake progress text', () => {
    render(<PreDriveGuide />);
    const cue = screen.getByTestId('loading-cue').querySelector('span');
    expect(cue).toHaveClass('animate-pulse');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('disables cue animation in reduced-motion mode', () => {
    mockMatchMedia(true);
    render(<PreDriveGuide />);
    const cue = screen.getByTestId('loading-cue').querySelector('span');
    expect(cue).not.toHaveClass('animate-pulse');
  });

  it('has deterministic focus path and focus-visible styles', () => {
    render(<PreDriveGuide />);
    const continueButton = screen.getByRole('button', { name: /CONTINUE/i });
    const backButton = screen.getByRole('button', { name: /BACK TO MENU/i });
    expect(document.activeElement).toBe(continueButton);
    expect(continueButton.className).toContain('focus-visible:ring-2');
    expect(backButton.className).toContain('focus-visible:ring-2');
  });

  it('keeps stable outcome on repeated continue and back triggers', () => {
    render(<PreDriveGuide />);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(useGameStore.getState().mode).toBe('driving');

    useGameStore.setState({ mode: 'pre-drive-guide', pendingDriveMode: 'manual' });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useGameStore.getState().mode).toBe('menu');
  });

  it('checkbox is unchecked by default', () => {
    render(<PreDriveGuide />);
    const checkbox = screen.getByRole('checkbox', { name: /Don't show again/i });
    expect(checkbox).not.toBeChecked();
  });

  it('checking persists to localStorage on continue', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<PreDriveGuide />);
    const checkbox = screen.getByRole('checkbox', { name: /Don't show again/i });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /CONTINUE/i }));
    expect(setItemSpy).toHaveBeenCalledWith('preDriveGuide:hidden', 'true');
    setItemSpy.mockRestore();
  });

  it('graceful degradation when localStorage throws', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    render(<PreDriveGuide />);
    const checkbox = screen.getByRole('checkbox', { name: /Don't show again/i });
    fireEvent.click(checkbox);
    
    // Should not crash
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: /CONTINUE/i }));
    }).not.toThrow();
    
    expect(useGameStore.getState().mode).toBe('driving');
    setItemSpy.mockRestore();
  });
});
