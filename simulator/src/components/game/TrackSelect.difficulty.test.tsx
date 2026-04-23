import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrackDifficultyDisplay, DIFFICULTY_ICONS, type DifficultyTier } from './TrackSelect.difficulty';

describe('TrackDifficultyDisplay', () => {
  const tiers: DifficultyTier[] = ['beginner', 'intermediate', 'advanced', 'special'];

  describe.each(tiers)('icon rendering for %s tier', (tier) => {
    it(`renders icon for ${tier} tier`, () => {
      render(<TrackDifficultyDisplay tier={tier} />);
      const icon = screen.getByTestId(`difficulty-icon-${tier}`);
      expect(icon).toBeInTheDocument();
    });
  });

  it('renders friendly label', () => {
    render(<TrackDifficultyDisplay tier="beginner" />);
    expect(screen.getByText('Beginner')).toBeInTheDocument();
  });

  it('renders helper text', () => {
    render(<TrackDifficultyDisplay tier="beginner" />);
    expect(screen.getByText('New to racing')).toBeInTheDocument();
  });

  it('renders separate section with prominence', () => {
    render(<TrackDifficultyDisplay tier="beginner" />);
    const container = screen.getByTestId('difficulty-section');
    expect(container).toHaveClass('text-sm');
  });

  it('shows full difficulty on locked track', () => {
    render(<TrackDifficultyDisplay tier="advanced" isLocked />);
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('Experienced drivers')).toBeInTheDocument();
  });

  it('falls back gracefully for unknown tier', () => {
    render(<TrackDifficultyDisplay tier="unknown" as unknown DifficultyTier />);
    expect(screen.getByText('Challenge')).toBeInTheDocument();
  });
});

describe('DIFFICULTY_ICONS', () => {
  it('has icon for all known tiers', () => {
    expect(DIFFICULTY_ICONS.beginner).toBeDefined();
    expect(DIFFICULTY_ICONS.intermediate).toBeDefined();
    expect(DIFFICULTY_ICONS.advanced).toBeDefined();
    expect(DIFFICULTY_ICONS.special).toBeDefined();
  });
});