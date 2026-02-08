'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';

const MAX_SPEED = 25;
const ACCELERATION = 12;
const BRAKE_FORCE = 20;
const FRICTION = 4;
const TURN_SPEED = 2.5;
const CAR_LENGTH = 2.0;
const CAR_WIDTH = 1.0;
const CAR_HEIGHT = 0.6;

const AI_TARGET_SPEED = 14;
const AI_LOOKAHEAD = 2; // waypoints ahead to steer toward

/**
 * The player car — reads keyboard input OR AI waypoint-following,
 * simulates arcade physics, updates the game store, and renders a simple box car.
 */
export function Car3D() {
  const meshRef = useRef<THREE.Group>(null);
  const frameCounter = useRef(0);
  const aiWaypointIdx = useRef(0);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    const isManual = store.mode === 'driving';
    const isAuto = store.mode === 'autonomous';
    if (!isManual && !isAuto) {
      // Still update mesh position for paused states
      if (meshRef.current) {
        meshRef.current.position.set(store.car.x, 0.5, store.car.z);
        meshRef.current.rotation.set(0, store.car.rotation, 0);
      }
      return;
    }

    const dt = Math.min(delta, 0.05); // cap delta
    const car = { ...store.car };
    const track = getTrack(store.trackId);

    if (isAuto) {
      // --- AI waypoint-following driver ---
      const wp = track.waypoints;
      // Find closest waypoint
      let closestDist = Infinity;
      let closestIdx = aiWaypointIdx.current;
      const searchRange = 10;
      for (let offset = -searchRange; offset <= searchRange; offset++) {
        const idx = ((aiWaypointIdx.current + offset) % wp.length + wp.length) % wp.length;
        const dx = wp[idx].x - car.x;
        const dz = wp[idx].z - car.z;
        const dist = dx * dx + dz * dz;
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      }
      aiWaypointIdx.current = closestIdx;

      // Target: a few waypoints ahead
      const targetIdx = (closestIdx + AI_LOOKAHEAD) % wp.length;
      const target = wp[targetIdx];

      // Desired angle to target
      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const desiredAngle = Math.atan2(dx, dz);

      // Angle difference (normalized to -PI..PI)
      let angleDiff = desiredAngle - car.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Steer toward target
      const steerAmount = Math.max(-1, Math.min(1, angleDiff * 2.5));
      car.steering = steerAmount;
      car.throttle = 1;

      // Speed control — slow down for sharp turns
      const turnSharpness = Math.abs(angleDiff);
      const targetSpeed = turnSharpness > 0.5 ? AI_TARGET_SPEED * 0.5 : AI_TARGET_SPEED;

      if (car.speed < targetSpeed) {
        car.speed = Math.min(car.speed + ACCELERATION * dt, targetSpeed);
      } else {
        car.speed = Math.max(car.speed - FRICTION * 2 * dt, targetSpeed);
      }

      // Turn
      if (Math.abs(car.speed) > 0.5) {
        const turnFactor = (car.speed / MAX_SPEED) * 0.7 + 0.3;
        car.rotation += steerAmount * TURN_SPEED * turnFactor * dt;
      }
    } else {
      // --- Manual keyboard input ---
      const keys = store.keys;
      const up = keys['ArrowUp'] || keys['w'] || keys['W'];
      const down = keys['ArrowDown'] || keys['s'] || keys['S'];
      const left = keys['ArrowLeft'] || keys['a'] || keys['A'];
      const right = keys['ArrowRight'] || keys['d'] || keys['D'];

      let throttle = 0;
      if (up) throttle = 1;
      if (down) throttle = -0.5;
      car.throttle = Math.max(0, throttle);

      if (up) {
        car.speed = Math.min(car.speed + ACCELERATION * dt, MAX_SPEED);
      } else if (down) {
        car.speed = Math.max(car.speed - BRAKE_FORCE * dt, -5);
      } else {
        if (car.speed > 0) car.speed = Math.max(0, car.speed - FRICTION * dt);
        else if (car.speed < 0) car.speed = Math.min(0, car.speed + FRICTION * dt);
      }

      let steer = 0;
      if (left) steer = 1;
      if (right) steer = -1;
      car.steering = steer;

      if (Math.abs(car.speed) > 0.5) {
        const turnFactor = (car.speed / MAX_SPEED) * 0.7 + 0.3;
        car.rotation += steer * TURN_SPEED * turnFactor * dt;
      }
    }

    // Move
    car.x += Math.sin(car.rotation) * car.speed * dt;
    car.z += Math.cos(car.rotation) * car.speed * dt;

    // Off-track detection
    const isOff = checkOffTrack(car.x, car.z, track.waypoints, track.width);
    store.setOffTrack(isOff);
    if (isOff) {
      car.speed *= 0.95;
    }

    // Lap detection
    checkLapCrossing(car, track.spawnPos, track.spawnRotation, store);

    // Update store
    store.updateCar(car);

    // Update elapsed time
    if (store.currentLapStart > 0) {
      store.setElapsedMs(performance.now() - store.currentLapStart);
    }

    // Log controls at ~10 FPS for training data
    frameCounter.current++;
    if (frameCounter.current % 6 === 0) {
      store.logControl();
    }

    // Update mesh
    if (meshRef.current) {
      meshRef.current.position.set(car.x, 0.5, car.z);
      meshRef.current.rotation.set(0, car.rotation, 0);
    }
  });

  return (
    <group ref={meshRef}>
      {/* Car body */}
      <mesh castShadow position={[0, CAR_HEIGHT / 2, 0]}>
        <boxGeometry args={[CAR_WIDTH, CAR_HEIGHT, CAR_LENGTH]} />
        <meshStandardMaterial color="#2563eb" />
      </mesh>
      {/* Roof / cockpit */}
      <mesh position={[0, CAR_HEIGHT + 0.15, -0.15]}>
        <boxGeometry args={[CAR_WIDTH * 0.8, 0.3, CAR_LENGTH * 0.5]} />
        <meshStandardMaterial color="#1e40af" />
      </mesh>
      {/* Front indicator */}
      <mesh position={[0, CAR_HEIGHT / 2, CAR_LENGTH / 2 + 0.05]}>
        <boxGeometry args={[CAR_WIDTH * 0.6, 0.15, 0.1]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.5} />
      </mesh>
      {/* Rear lights */}
      <mesh position={[0, CAR_HEIGHT / 2, -CAR_LENGTH / 2 - 0.05]}>
        <boxGeometry args={[CAR_WIDTH * 0.6, 0.15, 0.1]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function checkOffTrack(x: number, z: number, waypoints: { x: number; z: number }[], halfWidth: number): boolean {
  let minDist = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const dist = pointToSegmentDist(x, z, a.x, a.z, b.x, b.z);
    if (dist < minDist) minDist = dist;
  }
  return minDist > halfWidth;
}

function pointToSegmentDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projZ = az + t * dz;
  return Math.sqrt((px - projX) ** 2 + (pz - projZ) ** 2);
}

let lastCrossingSide: number | null = null;

function checkLapCrossing(
  car: { x: number; z: number; rotation: number; speed: number },
  spawnPos: [number, number, number],
  spawnRot: number,
  store: ReturnType<typeof useGameStore.getState>,
) {
  // Simple line-crossing detection at spawn position
  const dx = car.x - spawnPos[0];
  const dz = car.z - spawnPos[2];
  const lineNormalX = Math.sin(spawnRot);
  const lineNormalZ = Math.cos(spawnRot);
  const side = dx * lineNormalX + dz * lineNormalZ;

  if (lastCrossingSide !== null && lastCrossingSide < 0 && side >= 0 && car.speed > 1) {
    // Crossed from negative to positive side — lap complete
    store.completeLap();
  }
  lastCrossingSide = side;
}
