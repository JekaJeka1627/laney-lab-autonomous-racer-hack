'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/stores/game-store';

const CAMERA_DISTANCE = 8;
const CAMERA_HEIGHT = 4;
const CAMERA_LERP = 4;

/**
 * Chase camera that smoothly follows the car from behind.
 */
export function ChaseCamera() {
  const targetPos = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useFrame((_, delta) => {
    const car = useGameStore.getState().car;
    const dt = Math.min(delta, 0.05);

    // Desired camera position: behind and above the car
    const behindX = car.x - Math.sin(car.rotation) * CAMERA_DISTANCE;
    const behindZ = car.z - Math.cos(car.rotation) * CAMERA_DISTANCE;
    targetPos.current.set(behindX, CAMERA_HEIGHT, behindZ);

    // Look-at: slightly ahead of the car
    const aheadX = car.x + Math.sin(car.rotation) * 3;
    const aheadZ = car.z + Math.cos(car.rotation) * 3;
    targetLookAt.current.set(aheadX, 0.5, aheadZ);

    // Smooth interpolation
    camera.position.lerp(targetPos.current, CAMERA_LERP * dt);
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(10).add(camera.position);
    currentLookAt.lerp(targetLookAt.current, CAMERA_LERP * dt);
    camera.lookAt(targetLookAt.current);
  });

  return null;
}
