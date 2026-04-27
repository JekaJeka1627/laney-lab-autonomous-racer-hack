import { Car, Gauge, Flag, Star } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type DifficultyTier = 'beginner' | 'intermediate' | 'advanced' | 'special';

export const DIFFICULTY_ICONS: Record<DifficultyTier, LucideIcon> = {
  beginner: Car,
  intermediate: Gauge,
  advanced: Flag,
  special: Star,
};

interface DifficultyPresentation {
  label: string;
  helperText: string;
}

const DIFFICULTY_PRESENTATION: Record<DifficultyTier, DifficultyPresentation> = {
  beginner: {
    label: 'Beginner',
    helperText: 'New to racing',
  },
  intermediate: {
    label: 'Intermediate',
    helperText: 'Some experience needed',
  },
  advanced: {
    label: 'Advanced',
    helperText: 'Experienced drivers',
  },
  special: {
    label: 'Special',
    helperText: 'Unique challenge',
  },
};

const FALLBACK_PRESENTATION: DifficultyPresentation = {
  label: 'Challenge',
  helperText: 'Unknown difficulty',
};

const DIFFICULTY_COLORS: Record<DifficultyTier, string> = {
  beginner: 'text-green-400 bg-green-400/10 border-green-400/30',
  intermediate: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  advanced: 'text-red-400 bg-red-400/10 border-red-400/30',
  special: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
};

interface TrackDifficultyDisplayProps {
  tier: DifficultyTier;
  isLocked?: boolean;
}

export function TrackDifficultyDisplay({ tier, isLocked = false }: TrackDifficultyDisplayProps) {
  const presentation = DIFFICULTY_PRESENTATION[tier] ?? FALLBACK_PRESENTATION;
  const Icon = DIFFICULTY_ICONS[tier] ?? Star;
  const colorClass = DIFFICULTY_COLORS[tier] ?? DIFFICULTY_COLORS.beginner;

  return (
    <div
      data-testid="difficulty-section"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}
      className={`flex items-center gap-2 text-sm ${colorClass}`}
      role="presentation"
    >
      <span data-testid={`difficulty-icon-${tier}`} className="flex items-center">
        <Icon className="w-4 h-4" />
      </span>
      <span className="font-medium">{presentation.label}</span>
      <span className="text-gray-400">-</span>
      <span className="text-gray-400">{presentation.helperText}</span>
    </div>
  );
}