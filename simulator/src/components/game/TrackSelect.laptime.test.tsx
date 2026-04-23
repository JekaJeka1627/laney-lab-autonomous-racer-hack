import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackLapTimeDisplay } from './TrackSelect.laptime';

describe('TrackLapTimeDisplay', () => {
  it('renders placeholder text', () => {
    render(<TrackLapTimeDisplay text="Est. lap time: Coming soon" />);
    expect(screen.getByText('Est. lap time: Coming soon')).toBeInTheDocument();
  });

  it('renders icon', () => {
    render(<TrackLapTimeDisplay text="Est. lap time: Coming soon" />);
    const icon = screen.getByTestId('lap-time-icon');
    expect(icon).toBeInTheDocument();
  });

  it('shows on locked track', () => {
    render(<TrackLapTimeDisplay text="Est. lap time: Coming soon" isLocked />);
    expect(screen.getByText('Est. lap time: Coming soon')).toBeInTheDocument();
  });

  it('shows default text when empty', () => {
    render(<TrackLapTimeDisplay text="" />);
    expect(screen.getByText('Est. lap time: Coming soon')).toBeInTheDocument();
  });
});