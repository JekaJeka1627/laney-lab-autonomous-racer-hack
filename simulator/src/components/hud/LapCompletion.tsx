'use client';

import { useEffect, useRef, useState } from 'react';
import { useSpring, animated, config } from 'react-spring';
import { useGameStore } from '@/lib/stores/game-store';
import './LapCompletion.css';

/**
 * LapCompletion Component
 * 
 * Displays animated lap completion feedback with:
 * - Celebration animations (confetti/particles)
 * - Lap time and best lap comparison
 * - XP gained display
 * - Personal best badge
 * - Full accessibility support (screen readers, keyboard navigation)
 */

interface Particle {
  id: number;
  x: number;
  y: number;
}

export function LapCompletion() {
  const celebrationActive = useGameStore((s) => s.celebrationActive);
  const setCelebrationActive = useGameStore((s) => s.setCelebrationActive);
  const laps = useGameStore((s) => s.laps);
  const bestLapMs = useGameStore((s) => s.bestLapMs);
  const xp = useGameStore((s) => s.xp);
  const offTrackCount = useGameStore((s) => s.offTrackCount);

  const [particles, setParticles] = useState<Particle[]>([]);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [isCleanLap, setIsCleanLap] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const particleIdRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementRef = useRef<HTMLDivElement>(null);

  // Generate celebration particles
  const generateParticles = () => {
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: particleIdRef.current++,
      x: Math.random() * 100 - 50,
      y: Math.random() * 100 - 50,
    }));
    setParticles(newParticles);
  };

  // Hydration check — ensure we only render dynamic content on client
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Main celebration animation
  useEffect(() => {
    if (!celebrationActive || !isHydrated || laps.length === 0) return;

    const lastLap = laps[laps.length - 1];
    const lapTimeMs = lastLap.timeMs;
    const previousLaps = laps.slice(0, -1);

    // Check if it's a new personal best
    const newBest =
      previousLaps.length === 0 ||
      previousLaps.every((l) => l.timeMs > lapTimeMs);
    setIsNewPersonalBest(newBest);

    // Check if it's a clean lap (no off-track)
    const clean = lastLap.offTrackCount === 0;
    setIsCleanLap(clean);

    // Generate particles
    generateParticles();

    // Announce to screen readers
    if (announcementRef.current) {
      const bestStr = bestLapMs
        ? `Best lap: ${(bestLapMs / 1000).toFixed(2)} seconds. `
        : '';
      const announcement = `Lap ${lastLap.lapNumber} completed! Time: ${(
        lapTimeMs / 1000
      ).toFixed(2)} seconds. ${bestStr}${
        newBest ? 'New personal best! ' : ''
      }${clean ? 'Clean lap achieved! ' : ''}XP gained: 50${
        clean ? ' plus 25 bonus' : ''
      } points.`;

      announcementRef.current.textContent = announcement;
      announcementRef.current.setAttribute('role', 'status');
      announcementRef.current.setAttribute('aria-live', 'polite');
    }

    // Auto-dismiss after a short delay or on user action
    timeoutRef.current = setTimeout(() => {
      setCelebrationActive(false);
      setParticles([]);
    }, 7000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [celebrationActive, isHydrated, laps, bestLapMs, setCelebrationActive]);

  // Animation configs — must be called unconditionally for hook order
  const containerAnimation = useSpring({
    opacity: celebrationActive ? 1 : 0,
    transform: celebrationActive ? 'scale(1)' : 'scale(0.8)',
    config: config.molasses,
  });

  const titleAnimation = useSpring({
    opacity: celebrationActive ? 1 : 0,
    transform: celebrationActive
      ? 'translateY(0px)'
      : 'translateY(-20px)',
    delay: 100,
    config: config.wobbly,
  });

  const statsAnimation = useSpring({
    opacity: celebrationActive ? 1 : 0,
    transform: celebrationActive
      ? 'translateY(0px)'
      : 'translateY(20px)',
    delay: 200,
    config: config.gentle,
  });

  // Handle dismissal on escape key or click
  const handleDismiss = (e?: React.KeyboardEvent) => {
    if (e && e.key !== 'Escape') return;
    setCelebrationActive(false);
    setParticles([]);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  if (!celebrationActive || !isHydrated || laps.length === 0) return null;

  const lastLap = laps[laps.length - 1];
  const lapTimeMs = lastLap.timeMs;
  const lapTimeSeconds = (lapTimeMs / 1000).toFixed(2);
  const bestLapSeconds = bestLapMs ? (bestLapMs / 1000).toFixed(2) : null;
  const timeDiff = bestLapMs ? ((lapTimeMs - bestLapMs) / 1000).toFixed(2) : null;

  return (
    <div
      className="lap-completion-container"
      onClick={() => handleDismiss()}
      onKeyDown={handleDismiss}
      role="dialog"
      aria-label="Lap completion celebration"
      aria-modal="true"
      tabIndex={0}
    >
      {/* Screen reader announcement */}
      <div
        ref={announcementRef}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      {/* Particles background */}
      <div className="lap-completion-particles">
        {particles.map((particle) => (
          <Particle
            key={particle.id}
            id={particle.id}
            initialX={particle.x}
            initialY={particle.y}
          />
        ))}
      </div>

      {/* Main celebration card */}
      <div className="lap-completion-card-positioner">
        <animated.div
          style={containerAnimation}
          className="lap-completion-card"
        >
        {/* Celebration title */}
        <animated.div
          style={titleAnimation}
          className="lap-completion-title"
        >
          <span className="lap-completion-title-emoji">🎉</span>
          <h2 className="lap-completion-heading">
            Lap {lastLap.lapNumber} Complete!
          </h2>
          <span className="lap-completion-title-emoji">🎉</span>
        </animated.div>

        {/* Personal best badge */}
        {isNewPersonalBest && (
          <div className="lap-completion-badge lap-completion-badge-best">
            🏆 NEW PERSONAL BEST!
          </div>
        )}

        {/* Clean lap badge */}
        {isCleanLap && (
          <div className="lap-completion-badge lap-completion-badge-clean">
            ✨ CLEAN LAP!
          </div>
        )}

        {/* Lap statistics */}
        <animated.div
          style={statsAnimation}
          className="lap-completion-stats"
        >
          {/* Lap time */}
          <div className="lap-completion-stat-group">
            <span className="lap-completion-stat-label">Lap Time</span>
            <div className="lap-completion-stat-value">{lapTimeSeconds}s</div>
          </div>

          {/* Best lap comparison */}
          {bestLapSeconds && (
            <div className="lap-completion-stat-group">
              <span className="lap-completion-stat-label">Best Lap</span>
              <div className="lap-completion-stat-value">
                {bestLapSeconds}s
              </div>
              <div
                className={`lap-completion-stat-diff ${
                  parseFloat(timeDiff!) >= 0
                    ? 'lap-completion-diff-slower'
                    : 'lap-completion-diff-faster'
                }`}
              >
                {parseFloat(timeDiff!) >= 0 ? '+' : ''}{timeDiff}s
              </div>
            </div>
          )}

          {/* XP reward */}
          <div className="lap-completion-stat-group">
            <span className="lap-completion-stat-label">XP Gained</span>
            <div className="lap-completion-xp-value">
              +{isCleanLap ? '75' : '50'}
            </div>
            {isCleanLap && (
              <span className="lap-completion-xp-bonus">+25 clean lap bonus</span>
            )}
          </div>

          {/* Off-track count warning */}
          {lastLap.offTrackCount > 0 && (
            <div className="lap-completion-warning">
              ⚠️ Off-track: {lastLap.offTrackCount}x - next time stay on track
              for more XP!
            </div>
          )}
        </animated.div>

        {/* Instructions */}
        <div className="lap-completion-instructions">
          Press <kbd>ESC</kbd> or click to dismiss
        </div>
        </animated.div>
      </div>

      {/* Overlay */}
      {
      //disabling because overlay background and blur is distracting
      //while doing multiple laps
      /*<div
        className="lap-completion-overlay"
        aria-hidden="true"
      />*/
      }
    </div>
  );
}

/**
 * Particle component for celebration effect
 */
function Particle({
  id,
  initialX,
  initialY,
}: {
  id: number;
  initialX: number;
  initialY: number;
}) {
  const animation = useSpring({
    from: {
      opacity: 1,
      x: initialX,
      y: initialY,
    },
    to: {
      opacity: 0,
      x: initialX * 2,
      y: initialY * 2,
    },
    config: { duration: 2000 },
  });

  const colors = [
    'bg-yellow-400',
    'bg-green-400',
    'bg-blue-400',
    'bg-pink-400',
    'bg-purple-400',
  ];
  const color = colors[id % colors.length];

  return (
    <animated.div
      style={{
        opacity: animation.opacity,
        transform: animation.x.to(
          (x) =>
            `translate(${x}px, ${animation.y.get()}px) rotate(${id * 30}deg)`
        ),
      }}
      className={`lap-completion-particle ${color}`}
      aria-hidden="true"
    />
  );
}
