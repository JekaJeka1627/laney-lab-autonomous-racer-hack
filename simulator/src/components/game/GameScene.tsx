'use client';

import { Canvas } from '@react-three/fiber';
import { Track3D } from './Track3D';
import { Car3D } from './Car3D';
import { ChaseCamera } from './ChaseCamera';
import { useGameStore } from '@/lib/stores/game-store';

/**
 * The 3D game scene — contains the track, car, lighting, and camera.
 */
export function GameScene() {
  const trackId = useGameStore((s) => s.trackId);

  return (
    <Canvas shadows camera={{ fov: 60, near: 0.1, far: 500, position: [0, 10, 20] }}>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[50, 80, 30]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={200}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
      />
      <hemisphereLight args={['#87ceeb', '#2d5a27', 0.3]} />

      {/* Sky color */}
      <color attach="background" args={['#1a1a2e']} />
      <fog attach="fog" args={['#1a1a2e', 80, 200]} />

      {/* Track */}
      <Track3D trackId={trackId} />

      {/* Car */}
      <Car3D />

      {/* Camera */}
      <ChaseCamera />
    </Canvas>
  );
}
