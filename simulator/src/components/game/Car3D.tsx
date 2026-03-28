'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';
import { useAiDriverStore } from '@/lib/inference/ai-driver-store';

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
const AI_MODEL_STALE_MS = 800;

// Target-ramp constants
const STEER_RAMP = 5.0; // how fast steering moves toward target (per second)
const THROTTLE_RAMP = 3.0; // how fast throttle moves toward target (per second)
const STEER_DAMP = 3.0; // auto-recenter damping when no steer input

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

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
    const preferLearnedModel = store.aiSteeringMode === 'learned';
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
    const effectiveMaxSpeed = MAX_SPEED * (store.maxSpeedPct / 100);

    if (isAuto) {
      // --- AI steering: learned model when available, waypoint follower fallback ---
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

      const aiRuntime = useAiDriverStore.getState();
      const modelPredictionFresh = aiRuntime.predictedSteering !== null
        && aiRuntime.lastInferenceAtMs !== null
        && (performance.now() - aiRuntime.lastInferenceAtMs) <= AI_MODEL_STALE_MS;
      const useModelSteering = preferLearnedModel && aiRuntime.status === 'ready' && modelPredictionFresh;

      // AI sets targets directly (already continuous)
      car.steerTarget = useModelSteering
        ? clamp(aiRuntime.predictedSteering ?? 0, -1, 1)
        : clamp(angleDiff * 2.5, -1, 1);
      car.throttleTarget = 1;
      aiRuntime.setControlSource(useModelSteering ? 'model' : 'waypoint');

      // Ramp actual values toward targets (same pipeline as manual)
      car.steering += clamp(car.steerTarget - car.steering, -STEER_RAMP * dt, STEER_RAMP * dt);
      car.throttle += clamp(car.throttleTarget - car.throttle, -THROTTLE_RAMP * dt, THROTTLE_RAMP * dt);
      car.steering = clamp(car.steering, -1, 1);
      car.throttle = clamp(car.throttle, 0, 1);

      // Speed control — slow down for sharp turns
      const turnSharpness = useModelSteering
        ? Math.abs(car.steerTarget) * 0.9
        : Math.abs(angleDiff);
      const targetSpeed = turnSharpness > 0.5 ? AI_TARGET_SPEED * 0.5 : AI_TARGET_SPEED;

      const clampedTarget = Math.min(targetSpeed, effectiveMaxSpeed);
      if (car.speed < clampedTarget) {
        car.speed = Math.min(car.speed + ACCELERATION * dt, clampedTarget);
      } else {
        car.speed = Math.max(car.speed - FRICTION * 2 * dt, clampedTarget);
      }
    } else if (store.controlScheme === 'tilt') {
      car.steerTarget = store.analogSteer;
      car.throttleTarget = store.analogThrottle;

      car.steering += clamp(car.steerTarget - car.steering, -STEER_RAMP * dt, STEER_RAMP * dt);
      if (Math.abs(store.analogSteer) < 0.05) {
        car.steering *= 1 - (STEER_DAMP * dt);
      }
      car.steering = clamp(car.steering, -1, 1);
      if (Math.abs(car.steering) < 0.01) car.steering = 0;

      car.throttle += clamp(car.throttleTarget - car.throttle, -THROTTLE_RAMP * dt, THROTTLE_RAMP * dt);
      car.throttle = clamp(car.throttle, 0, 1);

      if (car.throttle > 0.01) {
        car.speed = Math.min(car.speed + ACCELERATION * car.throttle * dt, effectiveMaxSpeed);
      }
      if (store.manualControls.brake) {
        car.speed = Math.max(car.speed - BRAKE_FORCE * dt, 0);
        car.throttleTarget = 0;
      }
      if (car.throttle < 0.05) {
        if (car.speed > 0) car.speed = Math.max(0, car.speed - FRICTION * dt);
        else if (car.speed < 0) car.speed = Math.min(0, car.speed + FRICTION * dt);
      }
    } else {
      // --- Manual keyboard input (target + ramp) ---
      const keys = store.keys;
      const controls = store.manualControls;
      const up = controls.accelerate;
      const down = keys['ArrowDown'] || keys['s'] || keys['S'];
      const left = controls.left;
      const right = controls.right;
      const brake = controls.brake; // Space or touch brake = panic brake

      // Steering target: digital keys set target, ramp smooths it
      if (left) car.steerTarget = 1;
      else if (right) car.steerTarget = -1;
      else car.steerTarget = 0;

      // Ramp steering toward target
      car.steering += clamp(car.steerTarget - car.steering, -STEER_RAMP * dt, STEER_RAMP * dt);
      // Auto-recenter damping when no steer input
      if (!left && !right) {
        car.steering *= 1 - (STEER_DAMP * dt);
      }
      car.steering = clamp(car.steering, -1, 1);
      // Snap to zero if very small
      if (Math.abs(car.steering) < 0.01) car.steering = 0;

      // Throttle target from keys
      if (brake) {
        car.throttleTarget = 0; // panic brake
      } else if (up) {
        car.throttleTarget = 1;
      } else if (down) {
        car.throttleTarget = 0; // release gas (braking handled via BRAKE_FORCE below)
      } else {
        // No key: coast — throttle target decays toward 0
        car.throttleTarget = Math.max(0, car.throttleTarget - 0.5 * dt);
      }

      // Ramp throttle toward target
      car.throttle += clamp(car.throttleTarget - car.throttle, -THROTTLE_RAMP * dt, THROTTLE_RAMP * dt);
      car.throttle = clamp(car.throttle, 0, 1);

      // Apply acceleration / braking from throttle
      if (car.throttle > 0.01) {
        car.speed = Math.min(car.speed + ACCELERATION * car.throttle * dt, effectiveMaxSpeed);
      }
      if (down || brake) {
        car.speed = Math.max(car.speed - BRAKE_FORCE * dt, -5);
      }
      if (!up && !down && !brake && car.throttle < 0.05) {
        // Coast friction
        if (car.speed > 0) car.speed = Math.max(0, car.speed - FRICTION * dt);
        else if (car.speed < 0) car.speed = Math.min(0, car.speed + FRICTION * dt);
      }
    }

    // --- Speed-sensitive steering (shared pipeline for both manual & AI) ---
    if (Math.abs(car.speed) > 0.5) {
      const speedNorm = clamp(Math.abs(car.speed) / MAX_SPEED, 0, 1);
      const highSpeedFactor = lerp(1.0, 0.3, speedNorm);
      const steeringForPhysics = car.steering * highSpeedFactor;
      const turnFactor = (Math.abs(car.speed) / MAX_SPEED) * 0.7 + 0.3;
      car.rotation += steeringForPhysics * TURN_SPEED * turnFactor * dt;
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
