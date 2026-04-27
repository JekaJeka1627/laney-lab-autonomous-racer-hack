import { TRACKS, type TrackDef } from '@/lib/tracks/track-data';

export type TrackDifficultyTier = 'beginner' | 'intermediate' | 'advanced' | 'special';

export interface TrackDifficultyPresentation {
  tier: TrackDifficultyTier;
  label: string;
  helperText: string;
}

export interface TrackPreviewDescriptor {
  kind: 'generated' | 'placeholder';
  token: string;
  altText: string;
}

export interface TrackCardContract {
  id: string;
  sourceTrackId: string;
  name: string;
  description: string;
  difficulty: TrackDifficultyPresentation;
  lapTimeText: string;
  preview: TrackPreviewDescriptor;
  unlockRequirement: { totalClassLaps: number } | null;
  environment: 'outdoor' | 'lab' | 'unknown';
}

export interface TrackCardContractMapperOptions {
  defaultDescription?: string;
  lapTimeText?: string;
}

interface TrackCardSourceShape {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  difficulty?: unknown;
  environment?: unknown;
  unlockRequirement?: unknown;
}

const DIFFICULTY_PRESENTATION: Record<TrackDifficultyTier, TrackDifficultyPresentation> = {
  beginner: {
    tier: 'beginner',
    label: 'Beginner',
    helperText: 'New to racing',
  },
  intermediate: {
    tier: 'intermediate',
    label: 'Intermediate',
    helperText: 'Some experience needed',
  },
  advanced: {
    tier: 'advanced',
    label: 'Advanced',
    helperText: 'Experienced drivers',
  },
  special: {
    tier: 'special',
    label: 'Special',
    helperText: 'Unique challenge',
  },
};

const DEFAULT_DESCRIPTION = 'Track details coming soon.';
const DEFAULT_LAP_TIME_TEXT = 'Est. lap time: Coming soon';
const DEFAULT_NAME_PREFIX = 'Track';
const DEFAULT_DIFFICULTY_TIER: TrackDifficultyTier = 'beginner';

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDifficultyTier(value: unknown): TrackDifficultyTier {
  const token = asNonEmptyString(value)?.toLowerCase();
  if (token === 'beginner' || token === 'intermediate' || token === 'advanced' || token === 'special') {
    return token;
  }
  return DEFAULT_DIFFICULTY_TIER;
}

function normalizeEnvironment(value: unknown): TrackCardContract['environment'] {
  const token = asNonEmptyString(value)?.toLowerCase();
  if (token === 'outdoor' || token === 'lab') return token;
  return 'unknown';
}

function normalizeUnlockRequirement(value: unknown): { totalClassLaps: number } | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { totalClassLaps?: unknown };
  if (typeof record.totalClassLaps !== 'number' || Number.isNaN(record.totalClassLaps)) return null;
  if (record.totalClassLaps < 0) return null;
  return { totalClassLaps: record.totalClassLaps };
}

function createSafeTrackId(rawId: unknown, index: number): string {
  const initial = asNonEmptyString(rawId)?.toLowerCase() ?? '';
  const normalized = initial
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized.length > 0) return normalized;
  return `track-${index + 1}`;
}

function createPreviewDescriptor(name: string, safeId: string): TrackPreviewDescriptor {
  return {
    kind: 'placeholder',
    token: `preview:${safeId}`,
    altText: `${name} preview placeholder`,
  };
}

function getDifficultyPresentation(tier: TrackDifficultyTier): TrackDifficultyPresentation {
  return DIFFICULTY_PRESENTATION[tier];
}

/**
 * Build UI-facing track card contract entries from source tracks.
 * - Preserves source order.
 * - Emits presentation-ready strings.
 * - Applies deterministic fallbacks for malformed input.
 * - Uses first-wins policy for duplicate normalized ids.
 */
export function buildTrackCardContracts(
  tracks: readonly TrackCardSourceShape[],
  options: TrackCardContractMapperOptions = {},
): TrackCardContract[] {
  if (tracks.length === 0) return [];

  const defaultDescription = options.defaultDescription?.trim() || DEFAULT_DESCRIPTION;
  const lapTimeText = options.lapTimeText?.trim() || DEFAULT_LAP_TIME_TEXT;
  const seenIds = new Set<string>();
  const result: TrackCardContract[] = [];

  for (let index = 0; index < tracks.length; index += 1) {
    const source = tracks[index];
    const safeId = createSafeTrackId(source.id, index);
    if (seenIds.has(safeId)) continue;
    seenIds.add(safeId);

    const name = asNonEmptyString(source.name) ?? `${DEFAULT_NAME_PREFIX} ${index + 1}`;
    const description = asNonEmptyString(source.description) ?? defaultDescription;
    const tier = normalizeDifficultyTier(source.difficulty);

    result.push({
      id: safeId,
      sourceTrackId: asNonEmptyString(source.id) ?? safeId,
      name,
      description,
      difficulty: getDifficultyPresentation(tier),
      lapTimeText,
      preview: createPreviewDescriptor(name, safeId),
      unlockRequirement: normalizeUnlockRequirement(source.unlockRequirement),
      environment: normalizeEnvironment(source.environment),
    });
  }

  return result;
}

export function buildTrackCardContractsFromTrackDefs(
  tracks: readonly TrackDef[] = TRACKS,
  options: TrackCardContractMapperOptions = {},
): TrackCardContract[] {
  return buildTrackCardContracts(tracks, options);
}

export const TRACK_CARD_CONTRACTS = buildTrackCardContractsFromTrackDefs();
