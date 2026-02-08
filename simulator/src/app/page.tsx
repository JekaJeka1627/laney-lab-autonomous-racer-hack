'use client';

import dynamic from 'next/dynamic';
import { useGameStore } from '@/lib/stores/game-store';
import { TrackSelect } from '@/components/game/TrackSelect';
import { GameHUD } from '@/components/hud/GameHUD';
import { Minimap } from '@/components/minimap/Minimap';
import { KeyboardHandler } from '@/components/game/KeyboardHandler';
import { PauseOverlay } from '@/components/game/PauseOverlay';

const GameScene = dynamic(
  () => import('@/components/game/GameScene').then((m) => ({ default: m.GameScene })),
  { ssr: false },
);

export default function Home() {
  const mode = useGameStore((s) => s.mode);

  return (
    <>
      <KeyboardHandler />
      {mode === 'menu' ? (
        <TrackSelect />
      ) : (
        <div className="relative w-screen h-screen overflow-hidden bg-black">
          <GameScene />
          <GameHUD />
          <Minimap />
          <PauseOverlay />
        </div>
      )}
    </>
  );
}
