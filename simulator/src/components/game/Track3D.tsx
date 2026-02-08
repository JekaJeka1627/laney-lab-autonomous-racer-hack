'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getTrack, type TrackPoint } from '@/lib/tracks/track-data';

const CENTER_LINE_WIDTH = 0.18;
const DASH_LEN = 1.2;
const GAP_LEN = 0.8;

/**
 * Renders the 3D track surface, boundaries, center line, and ground plane.
 * Styled after AWS DeepRacer tracks — dark asphalt, white curbs, dashed black center line.
 */
export function Track3D({ trackId }: { trackId: string }) {
  const track = getTrack(trackId);
  const { surfaceGeo, leftGeo, rightGeo, centerLineGeo } = useMemo(
    () => buildTrackGeometry(track.waypoints, track.width),
    [track],
  );

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>

      {/* Track surface */}
      <mesh geometry={surfaceGeo} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial color="#3a3a3a" side={THREE.DoubleSide} />
      </mesh>

      {/* Center line (dashed black — DeepRacer style) */}
      <mesh geometry={centerLineGeo} position={[0, 0.025, 0]}>
        <meshStandardMaterial color="#111111" side={THREE.DoubleSide} />
      </mesh>

      {/* Left boundary (red/white curb) */}
      <mesh geometry={leftGeo} position={[0, 0.05, 0]}>
        <meshStandardMaterial color="#cc3333" />
      </mesh>

      {/* Right boundary (white curb) */}
      <mesh geometry={rightGeo} position={[0, 0.05, 0]}>
        <meshStandardMaterial color="#eeeeee" />
      </mesh>

      {/* Start/finish line — checkerboard style */}
      <mesh position={[track.spawnPos[0], 0.03, track.spawnPos[2]]} rotation={[-Math.PI / 2, 0, track.spawnRotation]}>
        <planeGeometry args={[track.width * 2, 0.6]} />
        <meshStandardMaterial color="#ffffff" opacity={0.9} transparent />
      </mesh>
      <mesh position={[track.spawnPos[0], 0.031, track.spawnPos[2]]} rotation={[-Math.PI / 2, 0, track.spawnRotation]}>
        <planeGeometry args={[track.width * 2, 0.15]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
    </group>
  );
}

function buildTrackGeometry(waypoints: TrackPoint[], halfWidth: number) {
  const n = waypoints.length;
  const surfaceVerts: number[] = [];
  const surfaceIndices: number[] = [];
  const leftVerts: number[] = [];
  const leftIndices: number[] = [];
  const rightVerts: number[] = [];
  const rightIndices: number[] = [];

  const curbWidth = 0.4;

  for (let i = 0; i < n; i++) {
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];
    const dx = next.x - curr.x;
    const dz = next.z - curr.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    // Normal perpendicular to direction
    const nx = -dz / len;
    const nz = dx / len;

    // Surface: left and right edge
    surfaceVerts.push(curr.x + nx * halfWidth, 0, curr.z + nz * halfWidth);
    surfaceVerts.push(curr.x - nx * halfWidth, 0, curr.z - nz * halfWidth);

    // Left curb
    leftVerts.push(curr.x + nx * halfWidth, 0, curr.z + nz * halfWidth);
    leftVerts.push(curr.x + nx * (halfWidth + curbWidth), 0, curr.z + nz * (halfWidth + curbWidth));

    // Right curb
    rightVerts.push(curr.x - nx * halfWidth, 0, curr.z - nz * halfWidth);
    rightVerts.push(curr.x - nx * (halfWidth + curbWidth), 0, curr.z - nz * (halfWidth + curbWidth));

    if (i < n - 1 || true) { // close the loop
      const base = i * 2;
      const nextBase = ((i + 1) % n) * 2;
      // Two triangles per quad
      surfaceIndices.push(base, nextBase, base + 1);
      surfaceIndices.push(base + 1, nextBase, nextBase + 1);
      leftIndices.push(base, nextBase, base + 1);
      leftIndices.push(base + 1, nextBase, nextBase + 1);
      rightIndices.push(base, nextBase, base + 1);
      rightIndices.push(base + 1, nextBase, nextBase + 1);
    }
  }

  // --- Center line (dashed) ---
  const centerVerts: number[] = [];
  const centerIndices: number[] = [];
  let accumulated = 0;
  let drawing = true; // start with a dash
  let cIdx = 0;

  for (let i = 0; i < n; i++) {
    const curr = waypoints[i];
    const next = waypoints[(i + 1) % n];
    const sdx = next.x - curr.x;
    const sdz = next.z - curr.z;
    const segLen = Math.sqrt(sdx * sdx + sdz * sdz) || 0.01;
    const dirX = sdx / segLen;
    const dirZ = sdz / segLen;
    // Perpendicular
    const pnx = -dirZ;
    const pnz = dirX;

    let traveled = 0;
    while (traveled < segLen) {
      const threshold = drawing ? DASH_LEN : GAP_LEN;
      const remaining = threshold - accumulated;
      const step = Math.min(remaining, segLen - traveled);

      if (drawing) {
        // Start point of this dash segment
        const sx = curr.x + dirX * traveled;
        const sz = curr.z + dirZ * traveled;
        // End point
        const ex = curr.x + dirX * (traveled + step);
        const ez = curr.z + dirZ * (traveled + step);

        const hw = CENTER_LINE_WIDTH;
        const base = cIdx;
        centerVerts.push(sx + pnx * hw, 0, sz + pnz * hw);
        centerVerts.push(sx - pnx * hw, 0, sz - pnz * hw);
        centerVerts.push(ex + pnx * hw, 0, ez + pnz * hw);
        centerVerts.push(ex - pnx * hw, 0, ez - pnz * hw);
        centerIndices.push(base, base + 2, base + 1);
        centerIndices.push(base + 1, base + 2, base + 3);
        cIdx += 4;
      }

      traveled += step;
      accumulated += step;
      if (accumulated >= (drawing ? DASH_LEN : GAP_LEN)) {
        accumulated = 0;
        drawing = !drawing;
      }
    }
  }

  function makeGeo(verts: number[], indices: number[]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  return {
    surfaceGeo: makeGeo(surfaceVerts, surfaceIndices),
    leftGeo: makeGeo(leftVerts, leftIndices),
    rightGeo: makeGeo(rightVerts, rightIndices),
    centerLineGeo: makeGeo(centerVerts, centerIndices),
  };
}
