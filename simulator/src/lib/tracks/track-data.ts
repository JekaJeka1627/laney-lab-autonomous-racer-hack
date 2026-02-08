/**
 * Track definitions — each track is a series of waypoints forming a closed loop.
 * The car follows these waypoints, and boundaries are computed from them.
 */

export interface TrackPoint {
  x: number;
  z: number;
}

export interface TrackDef {
  id: string;
  name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'special';
  description: string;
  width: number; // track half-width
  spawnPos: [number, number, number]; // x, y, z
  spawnRotation: number; // radians
  waypoints: TrackPoint[];
  unlockRequirement?: { totalClassLaps: number };
}

function ovalTrack(cx: number, cz: number, rx: number, rz: number, n: number): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(angle) * rx, z: cz + Math.sin(angle) * rz });
  }
  return pts;
}

function sCurveTrack(): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const segments = 80;
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const angle = t * Math.PI * 2;
    const x = Math.sin(angle) * 30 + Math.sin(angle * 2) * 12;
    const z = Math.cos(angle) * 40;
    pts.push({ x, z });
  }
  return pts;
}

/**
 * Compute the heading angle from the spawn point toward the nearest
 * next waypoint so the car faces along the track at start.
 */
function computeSpawnRotation(spawnX: number, spawnZ: number, waypoints: TrackPoint[]): number {
  // Find closest waypoint
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const dx = waypoints[i].x - spawnX;
    const dz = waypoints[i].z - spawnZ;
    const d = dx * dx + dz * dz;
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  }
  // Aim toward the next waypoint after the closest
  const nextIdx = (closestIdx + 1) % waypoints.length;
  const dx = waypoints[nextIdx].x - spawnX;
  const dz = waypoints[nextIdx].z - spawnZ;
  return Math.atan2(dx, dz);
}

const ovalWaypoints = ovalTrack(0, 0, 30, 20, 64);
const sCurveWaypoints = sCurveTrack();
const cityWaypoints: TrackPoint[] = [
  { x: -25, z: -25 }, { x: -25, z: 25 }, { x: -15, z: 30 },
  { x: 0, z: 25 }, { x: 5, z: 15 }, { x: 15, z: 10 },
  { x: 25, z: 15 }, { x: 30, z: 25 }, { x: 25, z: 30 },
  { x: 15, z: 25 }, { x: 10, z: 15 }, { x: 15, z: 5 },
  { x: 25, z: 0 }, { x: 25, z: -15 }, { x: 20, z: -25 },
  { x: 10, z: -30 }, { x: 0, z: -25 }, { x: -10, z: -30 },
  { x: -20, z: -28 },
];

export const TRACKS: TrackDef[] = [
  {
    id: 'oval',
    name: 'Oval',
    difficulty: 'beginner',
    description: 'Simple loop — learn the controls',
    width: 5,
    spawnPos: [30, 0.5, 0],
    spawnRotation: computeSpawnRotation(30, 0, ovalWaypoints),
    waypoints: ovalWaypoints,
  },
  {
    id: 's-curves',
    name: 'S-Curves',
    difficulty: 'intermediate',
    description: 'Tests smooth steering transitions',
    width: 4.5,
    spawnPos: [0, 0.5, -40],
    spawnRotation: computeSpawnRotation(0, -40, sCurveWaypoints),
    waypoints: sCurveWaypoints,
    unlockRequirement: { totalClassLaps: 10 },
  },
  {
    id: 'city-circuit',
    name: 'City Circuit',
    difficulty: 'advanced',
    description: 'Tight turns, intersections',
    width: 4,
    spawnPos: [-25, 0.5, -25],
    spawnRotation: computeSpawnRotation(-25, -25, cityWaypoints),
    waypoints: [
      { x: -25, z: -25 }, { x: -25, z: 25 }, { x: -15, z: 30 },
      { x: 0, z: 25 }, { x: 5, z: 15 }, { x: 15, z: 10 },
      { x: 25, z: 15 }, { x: 30, z: 25 }, { x: 25, z: 30 },
      { x: 15, z: 25 }, { x: 10, z: 15 }, { x: 15, z: 5 },
      { x: 25, z: 0 }, { x: 25, z: -15 }, { x: 20, z: -25 },
      { x: 10, z: -30 }, { x: 0, z: -25 }, { x: -10, z: -30 },
      { x: -20, z: -28 },
    ],
    unlockRequirement: { totalClassLaps: 30 },
  },
];

export function getTrack(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
