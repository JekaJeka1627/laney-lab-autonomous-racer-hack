'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getTrack, type TrackObstacle, type TrackPoint } from '@/lib/tracks/track-data';
import { useGameStore } from '@/lib/stores/game-store';

const CENTER_LINE_WIDTH = 0.18;
const DASH_LEN = 1.2;
const GAP_LEN = 0.8;

/**
 * Renders the 3D track surface, boundaries, center line, and ground plane.
 * Styled after AWS DeepRacer tracks — dark asphalt, white curbs, dashed black center line.
 */
export function Track3D({ trackId }: { trackId: string }) {
  const track = getTrack(trackId);
  const visualSeed = useGameStore((s) => s.trackVisualSeed);
  const { surfaceGeo, leftGeo, rightGeo, centerLineGeo } = useMemo(
    () => buildTrackGeometry(track.waypoints, track.width),
    [track],
  );
  const displayedObstacles = useMemo(
    () => (track.environment === 'lab' ? jitterLabObstacles(track.obstacles ?? [], visualSeed) : (track.obstacles ?? [])),
    [track, visualSeed],
  );

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={track.environment === 'lab' ? '#5f5b52' : '#2d5a27'} />
      </mesh>

      {track.environment === 'lab' && <LabEnvironment obstacles={displayedObstacles} />}
      {track.environment === 'outdoor' && <OutdoorEnvironment obstacles={displayedObstacles} />}

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

function hashString(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterLabObstacles(obstacles: TrackObstacle[], visualSeed: number): TrackObstacle[] {
  if (!visualSeed) return obstacles;
  return obstacles.map((obs) => {
    const rand = mulberry32((visualSeed ^ hashString(obs.id)) >>> 0);
    const jitterPos = obs.kind === 'chair' ? 0.75 : obs.kind === 'cone' ? 1.0 : 0.45;
    const jitterRot = obs.kind === 'cone' ? 0.25 : 0.45;
    const dx = (rand() * 2 - 1) * jitterPos;
    const dz = (rand() * 2 - 1) * jitterPos;
    const drot = (rand() * 2 - 1) * jitterRot;
    return {
      ...obs,
      x: obs.x + dx,
      z: obs.z + dz,
      rotation: (obs.rotation ?? 0) + drot,
    };
  });
}

function LabEnvironment({ obstacles }: { obstacles: TrackObstacle[] }) {
  const roomWidth = 104;
  const roomDepth = 72;
  const wallHeight = 10;
  const ceilingY = 9.9;
  return (
    <group>
      {/* Room pad / floor tint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color="#b88b63" roughness={0.97} metalness={0.02} />
      </mesh>

      {/* Floor tile grid helps the car feel small in a full-size room */}
      {Array.from({ length: 9 }).map((_, i) => {
        const z = -32 + i * 8;
        return (
          <mesh key={`tile-z-${i}`} position={[0, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[roomWidth, 0.06]} />
            <meshStandardMaterial color="#9f7f5c" opacity={0.28} transparent />
          </mesh>
        );
      })}
      {Array.from({ length: 13 }).map((_, i) => {
        const x = -48 + i * 8;
        return (
          <mesh key={`tile-x-${i}`} position={[x, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[roomDepth, 0.06]} />
            <meshStandardMaterial color="#9f7f5c" opacity={0.28} transparent />
          </mesh>
        );
      })}

      {/* Full-height room boundary walls */}
      <mesh position={[0, wallHeight / 2, -roomDepth / 2]}>
        <boxGeometry args={[roomWidth, wallHeight, 0.8]} />
        <meshStandardMaterial color="#7c3124" />
      </mesh>
      <mesh position={[0, wallHeight / 2, roomDepth / 2]}>
        <boxGeometry args={[roomWidth, wallHeight, 0.8]} />
        <meshStandardMaterial color="#ece9e2" />
      </mesh>
      <mesh position={[-roomWidth / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.8, wallHeight, roomDepth]} />
        <meshStandardMaterial color="#7c3124" />
      </mesh>
      <mesh position={[roomWidth / 2, wallHeight / 2, 0]}>
        <boxGeometry args={[0.8, wallHeight, roomDepth]} />
        <meshStandardMaterial color="#f3f0ea" />
      </mesh>

      {/* Brick mortar lines to read like the classroom walls */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`mortar-back-${i}`} position={[0, 1.0 + i * 1.05, -roomDepth / 2 + 0.45]}>
          <boxGeometry args={[roomWidth - 1.5, 0.05, 0.03]} />
          <meshStandardMaterial color="#d5c8b4" />
        </mesh>
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`mortar-left-${i}`} position={[-roomWidth / 2 + 0.45, 1.0 + i * 1.05, 0]}>
          <boxGeometry args={[0.03, 0.05, roomDepth - 2]} />
          <meshStandardMaterial color="#d5c8b4" />
        </mesh>
      ))}

      {/* Drop ceiling plane + grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, ceilingY, 0]}>
        <planeGeometry args={[roomWidth, roomDepth]} />
        <meshStandardMaterial color="#f1f1ee" roughness={0.9} />
      </mesh>
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={`ceil-z-${i}`} position={[0, ceilingY - 0.02, -32.4 + i * 7.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[roomWidth, 0.04]} />
          <meshStandardMaterial color="#c8c8c4" />
        </mesh>
      ))}
      {Array.from({ length: 15 }).map((_, i) => (
        <mesh key={`ceil-x-${i}`} position={[-49 + i * 7, ceilingY - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[roomDepth, 0.04]} />
          <meshStandardMaterial color="#c8c8c4" />
        </mesh>
      ))}

      {/* Window wall + shade panels (matches classroom photos) */}
      {[-34, -22, -10, 2, 14].map((x) => (
        <group key={`window-${x}`} position={[x, 5.9, roomDepth / 2 - 0.45]}>
          <mesh>
            <boxGeometry args={[10.1, 5.6, 0.08]} />
            <meshStandardMaterial color="#b9d7ea" opacity={0.45} transparent />
          </mesh>
          <mesh position={[0, 0, -0.02]}>
            <boxGeometry args={[10.9, 5.95, 0.04]} />
            <meshStandardMaterial color="#4a3a34" />
          </mesh>
          <mesh position={[0, 1.2, 0.03]}>
            <boxGeometry args={[10.1, 2.5, 0.03]} />
            <meshStandardMaterial color="#efe8db" opacity={0.95} transparent />
          </mesh>
          <mesh position={[0, -1.45, 0.03]}>
            <boxGeometry args={[10.1, 2.0, 0.03]} />
            <meshStandardMaterial color="#aeb8c7" opacity={0.55} transparent />
          </mesh>
        </group>
      ))}

      {/* Whiteboards/screens on the bright wall */}
      {[-14, 6, 26].map((x) => (
        <group key={`board-${x}`} position={[x, 5.1, roomDepth / 2 - 2.4]}>
          <mesh>
            <boxGeometry args={[13.8, 4.2, 0.09]} />
            <meshStandardMaterial color="#f7f8f9" />
          </mesh>
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[14.4, 4.7, 0.03]} />
            <meshStandardMaterial color="#bdb7ac" />
          </mesh>
        </group>
      ))}

      {/* Cabinet / counter run along brick wall */}
      <group position={[4, 0, -roomDepth / 2 + 2.1]}>
        <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[56, 2.2, 2.2]} />
          <meshStandardMaterial color="#aa7a51" />
        </mesh>
        <mesh position={[0, 2.28, 0]}>
          <boxGeometry args={[56.2, 0.14, 2.35]} />
          <meshStandardMaterial color="#e7dfd2" />
        </mesh>
        {[-23, -15, -7, 1, 9, 17, 25].map((x) => (
          <mesh key={`upper-cab-${x}`} position={[x, 6.45, -0.05]}>
            <boxGeometry args={[6.2, 2.5, 1.35]} />
            <meshStandardMaterial color="#bb8a5d" />
          </mesh>
        ))}
      </group>

      {/* Large storage cabinet on the right wall */}
      <mesh position={[roomWidth / 2 - 6, 2.5, 10]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 5.0, 2.8]} />
        <meshStandardMaterial color="#a8acaf" />
      </mesh>

      {/* Perimeter computer benches like the real room */}
      <ComputerBenchRow position={[-20, 0, roomDepth / 2 - 5.5]} stations={5} />
      <ComputerBenchRow position={[-roomWidth / 2 + 7, 0, 10]} rotation={Math.PI / 2} stations={4} />
      <ComputerBenchRow position={[-roomWidth / 2 + 7, 0, -16]} rotation={Math.PI / 2} stations={4} />

      {/* Collaboration tables */}
      <OvalTableGroup position={[-6, 0, 8]} />
      <OvalTableGroup position={[16, 0, 14]} rotation={0.18} compact />

      {/* Ceiling lights as visual references */}
      {[-36, -18, 0, 18, 36].flatMap((x) => [-20, -6, 8, 22].map((z) => ({ x, z }))).map(({ x, z }) => (
        <group key={`light-${x}-${z}`} position={[x, ceilingY - 0.12, z]}>
          <mesh>
            <boxGeometry args={[8.6, 0.11, 2.7]} />
            <meshStandardMaterial color="#ecece6" emissive="#fff7cf" emissiveIntensity={0.18} />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <boxGeometry args={[8.0, 0.03, 2.1]} />
            <meshStandardMaterial color="#fff7d9" emissive="#fff4c0" emissiveIntensity={0.34} />
          </mesh>
        </group>
      ))}

      {/* Teacher station and storage add more "real room" scale references */}
      <group position={[-36, 0, -28]} rotation={[0, 0.05, 0]}>
        <TableProp />
        <mesh position={[4.8, 1.4, -0.8]} castShadow receiveShadow>
          <boxGeometry args={[1.4, 2.8, 0.8]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      </group>
      <mesh position={[40, 1.6, 24]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 3.2, 10]} />
        <meshStandardMaterial color="#b8b1a3" />
      </mesh>

      {obstacles.map((obs) => (
        <group
          key={obs.id}
          position={[obs.x, 0, obs.z]}
          rotation={[0, obs.rotation ?? 0, 0]}
          scale={obs.scale ?? 1}
        >
          {renderObstacle(obs)}
        </group>
      ))}
    </group>
  );
}

function OutdoorEnvironment({ obstacles }: { obstacles: TrackObstacle[] }) {
  return (
    <group>
      {/* Infield patch for visual contrast on large outdoor ovals */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} scale={[1, 22 / 42, 1]} receiveShadow>
        <circleGeometry args={[42, 64]} />
        <meshStandardMaterial color="#3f7f34" roughness={0.95} />
      </mesh>

      {/* Sparse perimeter light poles make the space feel like a race venue */}
      {[-78, -52, -26, 0, 26, 52, 78].flatMap((x) => [-56, 56].map((z) => ({ x, z }))).map(({ x, z }) => (
        <group key={`pole-${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, 6, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.28, 12, 8]} />
            <meshStandardMaterial color="#858c93" />
          </mesh>
          <mesh position={[0, 11.85, 0]}>
            <boxGeometry args={[2.4, 0.12, 0.5]} />
            <meshStandardMaterial color="#d9dde2" emissive="#fff5bf" emissiveIntensity={0.25} />
          </mesh>
        </group>
      ))}

      {obstacles.map((obs) => (
        <group
          key={obs.id}
          position={[obs.x, 0, obs.z]}
          rotation={[0, obs.rotation ?? 0, 0]}
          scale={obs.scale ?? 1}
        >
          {renderObstacle(obs)}
        </group>
      ))}
    </group>
  );
}

function renderObstacle(obs: TrackObstacle) {
  if (obs.kind === 'table') return <TableProp />;
  if (obs.kind === 'chair') return <ChairProp />;
  if (obs.kind === 'cone') return <ConeProp />;
  if (obs.kind === 'tree') return <TreeProp />;
  if (obs.kind === 'bleachers') return <BleachersProp />;
  if (obs.kind === 'grandstand') return <GrandstandProp />;
  return null;
}

function ComputerBenchRow({
  position,
  rotation = 0,
  stations,
}: {
  position: [number, number, number];
  rotation?: number;
  stations: number;
}) {
  const length = stations * 5;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.14, 2.1]} />
        <meshStandardMaterial color="#af7a50" />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[length, 0.96, 0.16]} />
        <meshStandardMaterial color="#2d2d31" />
      </mesh>
      {Array.from({ length: stations }).map((_, i) => {
        const x = -length / 2 + 2.5 + i * 5;
        return (
          <group key={i} position={[x, 0, -0.1]}>
            <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.8, 1.08, 0.1]} />
              <meshStandardMaterial color="#121418" />
            </mesh>
            <mesh position={[0, 1.13, 0.02]} castShadow>
              <boxGeometry args={[0.12, 0.32, 0.08]} />
              <meshStandardMaterial color="#303640" />
            </mesh>
            <mesh position={[0, 0.93, 0.55]} castShadow>
              <boxGeometry args={[0.6, 0.04, 0.4]} />
              <meshStandardMaterial color="#1f1f22" />
            </mesh>
            <mesh position={[0, 0, 1.35]}>
              <ChairProp />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function OvalTableGroup({
  position,
  rotation = 0,
  compact = false,
}: {
  position: [number, number, number];
  rotation?: number;
  compact?: boolean;
}) {
  const s = compact ? 0.85 : 1;
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={s}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[4.7, 4.7, 0.16, 28]} />
        <meshStandardMaterial color="#965f3a" />
      </mesh>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[1.35, 1.75, 1.1, 18]} />
        <meshStandardMaterial color="#7e4f31" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} position={[Math.cos(a) * 5.9, 0, Math.sin(a) * 5.9]} rotation={[0, -a + Math.PI, 0]}>
            <ChairProp />
          </group>
        );
      })}
    </group>
  );
}

function TableProp() {
  return (
    <group>
      <mesh position={[0, 1.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[6.4, 0.18, 3.0]} />
        <meshStandardMaterial color="#9a623c" />
      </mesh>
      {[
        [-2.8, 0.55, -1.25],
        [2.8, 0.55, -1.25],
        [-2.8, 0.55, 1.25],
        [2.8, 0.55, 1.25],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.18, 1.1, 0.18]} />
          <meshStandardMaterial color="#6f4a2f" />
        </mesh>
      ))}
    </group>
  );
}

function ChairProp() {
  return (
    <group>
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 0.12, 1.25]} />
        <meshStandardMaterial color="#79ce2a" />
      </mesh>
      <mesh position={[0, 1.38, -0.52]} castShadow>
        <boxGeometry args={[1.25, 1.25, 0.12]} />
        <meshStandardMaterial color="#69bf23" />
      </mesh>
      {[
        [-0.48, 0.3, -0.48],
        [0.48, 0.3, -0.48],
        [-0.48, 0.3, 0.48],
        [0.48, 0.3, 0.48],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.1, 0.6, 0.1]} />
          <meshStandardMaterial color="#7f858b" />
        </mesh>
      ))}
      {[[-0.42, 0.12, -0.42], [0.42, 0.12, -0.42], [-0.42, 0.12, 0.42], [0.42, 0.12, 0.42]].map((p, i) => (
        <mesh
          key={`wheel-${i}`}
          position={p as [number, number, number]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.08, 0.08, 0.05, 8]} />
          <meshStandardMaterial color="#222529" />
        </mesh>
      ))}
    </group>
  );
}

function ConeProp() {
  return (
    <group>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.45, 0.7, 12]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.06, 12]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
    </group>
  );
}

function TreeProp() {
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.36, 2.4, 10]} />
        <meshStandardMaterial color="#6b4f2a" />
      </mesh>
      <mesh position={[0, 2.7, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.35, 2.2, 14]} />
        <meshStandardMaterial color="#2f7d32" />
      </mesh>
      <mesh position={[0, 3.6, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.05, 1.8, 14]} />
        <meshStandardMaterial color="#2b6f2e" />
      </mesh>
    </group>
  );
}

function BleachersProp() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} receiveShadow>
        <boxGeometry args={[12, 0.22, 4.2]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      <mesh position={[0, 0.75, -1.2]} receiveShadow>
        <boxGeometry args={[12, 0.22, 3.1]} />
        <meshStandardMaterial color="#7b8490" />
      </mesh>
      <mesh position={[0, 1.1, -2.1]} receiveShadow>
        <boxGeometry args={[12, 0.22, 2.0]} />
        <meshStandardMaterial color="#8892a0" />
      </mesh>
      <mesh position={[0, 1.45, -2.8]} receiveShadow>
        <boxGeometry args={[12, 0.22, 1.1]} />
        <meshStandardMaterial color="#9aa3ad" />
      </mesh>
      {[-5.6, 5.6].map((x) => (
        <mesh key={x} position={[x, 0.72, -1.2]}>
          <boxGeometry args={[0.28, 1.1, 3.3]} />
          <meshStandardMaterial color="#5b6370" />
        </mesh>
      ))}
    </group>
  );
}

function GrandstandProp() {
  return (
    <group>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[18, 1.4, 5.6]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh position={[0, 2.2, -0.6]} castShadow receiveShadow>
        <boxGeometry args={[18.6, 1.6, 4.8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 3.3, -1.8]} castShadow receiveShadow>
        <boxGeometry args={[19.2, 0.2, 2.8]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0, 4.2, -1.8]} castShadow>
        <boxGeometry args={[19.2, 1.6, 0.25]} />
        <meshStandardMaterial color="#b91c1c" />
      </mesh>
      <mesh position={[0, 4.4, 0.6]} castShadow receiveShadow>
        <boxGeometry args={[20.0, 0.24, 7.0]} />
        <meshStandardMaterial color="#9ca3af" />
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
