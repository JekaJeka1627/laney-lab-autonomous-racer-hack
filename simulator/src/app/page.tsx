'use client';

import dynamic from 'next/dynamic';
import { useGameStore } from '@/lib/stores/game-store';
import { TrackSelect } from '@/components/game/TrackSelect';
import { GameHUD } from '@/components/hud/GameHUD';
import { Minimap } from '@/components/minimap/Minimap';
import { KeyboardHandler } from '@/components/game/KeyboardHandler';
import { GamepadHandler } from '@/components/game/GamepadHandler';
import { PauseOverlay } from '@/components/game/PauseOverlay';
import { AutoControls } from '@/components/game/AutoControls';
import { RunComplete } from '@/components/game/RunComplete';
import { SpeedLimiter } from '@/components/hud/SpeedLimiter';
import { ManualDriveControls } from '@/components/hud/ManualDriveControls';
import { ControlsHUD } from '@/components/hud/ControlsHUD';
import { CameraFeed } from '@/components/hud/CameraFeed';
import { ModelInferenceRunner } from '@/components/ai/ModelInferenceRunner';
import { AiModelPanel } from '@/components/ai/AiModelPanel';
import { MobileDriveHelp } from '@/components/hud/MobileDriveHelp';

const GameScene = dynamic(
  () => import('@/components/game/GameScene').then((m) => ({ default: m.GameScene })),
  { ssr: false },
);

export default function Home() {
  const mode = useGameStore((s) => s.mode);
  const aiModelSelectionMode = useGameStore((s) => s.aiModelSelectionMode);
  const aiPinnedModelVersion = useGameStore((s) => s.aiPinnedModelVersion);

  const inGame = mode !== 'menu';

  return (
    <>
      <KeyboardHandler />
      <GamepadHandler />
      {!inGame ? (
        <TrackSelect />
      ) : (
        <div className="simulator-shell relative w-screen h-screen overflow-hidden bg-black">
          <ModelInferenceRunner
            selectionMode={aiModelSelectionMode}
            pinnedModelVersion={aiPinnedModelVersion}
          />
          <GameScene />
          <GameHUD />
          <Minimap />
          <PauseOverlay />
          <AutoControls />
          <SpeedLimiter />
          <ManualDriveControls />
          <MobileDriveHelp />
          <ControlsHUD />
          <CameraFeed />
          <AiModelPanel />
          <RunComplete />
        </div>
      )}
    </>
  );
}
