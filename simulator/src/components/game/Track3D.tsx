'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getTrack, type TrackPoint } from '@/lib/tracks/track-data';

/**
 * Renders the 3D track surface, boundaries, and ground plane.
 */
export function Track3D({ trackId }: { trackId: string }) {
  const track = getTrack(trackId);
  const { surfaceGeo, leftGeo, rightGeo } = useMemo(() => buildTrackGeometry(track.waypoints, track.width), [track]);

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#2d5a27" />
      </mesh>

      {/* Track surface */}
      <mesh geometry={surfaceGeo} position={[0, 0.01, 0]} receiveShadow>
        <meshStandardMaterial color="#444444" side={THREE.DoubleSide} />
      </mesh>

      {/* Left boundary (red curb) */}
      <mesh geometry={leftGeo} position={[0, 0.05, 0]}>
        <meshStandardMaterial color="#cc3333" />
      </mesh>

      {/* Right boundary (white curb) */}
      <mesh geometry={rightGeo} position={[0, 0.05, 0]}>
        <meshStandardMaterial color="#eeeeee" />
      </mesh>

      {/* Start/finish line */}
      <mesh position={[track.spawnPos[0], 0.02, track.spawnPos[2]]} rotation={[-Math.PI / 2, 0, track.spawnRotation]}>
        <planeGeometry args={[track.width * 2, 0.5]} />
        <meshStandardMaterial color="#ffffff" opacity={0.8} transparent />
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
  };
}
