'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/stores/game-store';

const PARTICLE_COUNT = 100;
const DURATION = 2500; // ms
const FADE_START = 2000; // ms

function playCelebrationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // Pleasant chime frequency
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.warn('Audio playback failed:', error);
  }
}

export function LapCelebration() {
  const store = useGameStore();
  const particlesRef = useRef<THREE.Points>(null);
  const activeRef = useRef(false);
  const startTimeRef = useRef(0);
  const velocitiesRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (store.celebrationActive && !activeRef.current) {
      activeRef.current = true;
      startTimeRef.current = performance.now();

      // Play celebration sound
      playCelebrationSound();

      // Initialize particles
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      const colors = new Float32Array(PARTICLE_COUNT * 3);
      const velocities = new Float32Array(PARTICLE_COUNT * 3);

      const carPos = store.car;
      const carY = 0.5; // Car is positioned at y=0.5 in the scene
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = carPos.x + (Math.random() - 0.5) * 10;
        positions[i * 3 + 1] = carY + 5 + Math.random() * 5;
        positions[i * 3 + 2] = carPos.z + (Math.random() - 0.5) * 10;

        colors[i * 3] = Math.random() * 0.5 + 0.5; // bright colors
        colors[i * 3 + 1] = Math.random() * 0.5 + 0.5;
        colors[i * 3 + 2] = Math.random() * 0.5 + 0.5;

        velocities[i * 3] = (Math.random() - 0.5) * 2; // horizontal spread
        velocities[i * 3 + 1] = -Math.random() * 5 - 2; // downward
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 1,
      });

      if (particlesRef.current) {
        particlesRef.current.geometry = geometry;
        particlesRef.current.material = material;
      }

      velocitiesRef.current = velocities;
    }
  }, [store.celebrationActive, store.car]);

  useFrame((_, delta) => {
    if (activeRef.current && particlesRef.current && velocitiesRef.current) {
      const elapsed = performance.now() - startTimeRef.current;
      if (elapsed > DURATION) {
        activeRef.current = false;
        store.setCelebrationActive(false);
        return;
      }

      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      const vel = velocitiesRef.current;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3] += vel[i * 3] * delta;
        positions[i * 3 + 1] += vel[i * 3 + 1] * delta;
        positions[i * 3 + 2] += vel[i * 3 + 2] * delta;

        // Apply gravity
        vel[i * 3 + 1] += -9.8 * delta;
      }

      particlesRef.current.geometry.attributes.position.needsUpdate = true;

      // Fade out
      let opacity = 1;
      if (elapsed > FADE_START) {
        opacity = Math.max(0, 1 - (elapsed - FADE_START) / (DURATION - FADE_START));
      }
      (particlesRef.current.material as THREE.PointsMaterial).opacity = opacity;
    }
  });

  if (!store.celebrationActive) return null;

  return <points ref={particlesRef} />;
}