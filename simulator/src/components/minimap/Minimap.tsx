'use client';

import { useRef, useEffect } from 'react';
import { useGameStore } from '@/lib/stores/game-store';
import { getTrack } from '@/lib/tracks/track-data';

const MAP_SIZE = 180;
const PADDING = 15;

/**
 * 2D top-down minimap — canvas overlay showing track, car position, and racing line.
 */
export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<{ x: number; z: number }[]>([]);

  useEffect(() => {
    let animId: number;

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const store = useGameStore.getState();
      const track = getTrack(store.trackId);
      const wp = track.waypoints;

      // Compute bounds
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of wp) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
      const rangeX = maxX - minX || 1;
      const rangeZ = maxZ - minZ || 1;
      const scale = (MAP_SIZE - PADDING * 2) / Math.max(rangeX, rangeZ);

      function toScreen(wx: number, wz: number): [number, number] {
        const sx = PADDING + (wx - minX) * scale;
        const sy = PADDING + (wz - minZ) * scale;
        return [sx, sy];
      }

      // Clear
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(0, 0, MAP_SIZE, MAP_SIZE, 12);
      ctx.fill();

      // Track outline
      ctx.strokeStyle = '#555';
      ctx.lineWidth = track.width * scale * 0.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= wp.length; i++) {
        const p = wp[i % wp.length];
        const [sx, sy] = toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();

      // Track surface
      ctx.strokeStyle = '#666';
      ctx.lineWidth = track.width * scale * 0.35;
      ctx.beginPath();
      for (let i = 0; i <= wp.length; i++) {
        const p = wp[i % wp.length];
        const [sx, sy] = toScreen(p.x, p.z);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();

      // Racing line trail
      if (store.mode === 'driving') {
        trailRef.current.push({ x: store.car.x, z: store.car.z });
        if (trailRef.current.length > 500) trailRef.current.shift();
      }
      if (trailRef.current.length > 1) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < trailRef.current.length; i++) {
          const p = trailRef.current[i];
          const [sx, sy] = toScreen(p.x, p.z);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Car dot
      const [cx, cy] = toScreen(store.car.x, store.car.z);
      ctx.fillStyle = store.offTrack ? '#ef4444' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Car direction indicator
      const dirLen = 8;
      const dirX = cx + Math.sin(store.car.rotation) * dirLen;
      const dirY = cy + Math.cos(store.car.rotation) * dirLen;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dirX, dirY);
      ctx.stroke();

      // Start/finish marker
      const [sx, sy] = toScreen(track.spawnPos[0], track.spawnPos[2]);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - 3, sy - 1, 6, 2);

      animId = requestAnimationFrame(draw);
    }

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_SIZE}
      height={MAP_SIZE}
      className="absolute top-4 right-4 z-20 rounded-xl"
      style={{ width: MAP_SIZE, height: MAP_SIZE }}
    />
  );
}
