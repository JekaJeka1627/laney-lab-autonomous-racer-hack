import { Timer } from 'lucide-react';

interface TrackLapTimeDisplayProps {
  text?: string;
  isLocked?: boolean;
}

const DEFAULT_LAP_TIME_TEXT = 'Est. lap time: Coming soon';

export function TrackLapTimeDisplay({ text, isLocked = false }: TrackLapTimeDisplayProps) {
  const displayText = text?.trim() || DEFAULT_LAP_TIME_TEXT;

  return (
    <div
      data-testid="lap-time-section"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); } }}
      className="flex items-center gap-2 text-sm text-gray-400"
      role="presentation"
    >
      <span data-testid="lap-time-icon" className="flex items-center">
        <Timer className="w-4 h-4" />
      </span>
      <span>{displayText}</span>
    </div>
  );
}