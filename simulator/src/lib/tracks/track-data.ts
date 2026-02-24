/**
 * Track definitions — each track is a series of waypoints forming a closed loop.
 * The car follows these waypoints, and boundaries are computed from them.
 */

export interface TrackPoint {
  x: number;
  z: number;
}

export interface TrackObstacle {
  id: string;
  kind: 'table' | 'chair' | 'cone';
  x: number;
  z: number;
  rotation?: number;
  scale?: number;
}

export interface TrackDef {
  id: string;
  name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'special';
  description: string;
  environment?: 'outdoor' | 'lab';
  width: number; // track half-width
  spawnPos: [number, number, number]; // x, y, z
  spawnRotation: number; // radians
  waypoints: TrackPoint[];
  obstacles?: TrackObstacle[];
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

const classroomLabWaypoints: TrackPoint[] = [
  { x: -34, z: -18 }, { x: -22, z: -18 }, { x: -12, z: -10 }, { x: -2, z: -8 },
  { x: 8, z: -8 }, { x: 18, z: -16 }, { x: 30, z: -16 }, { x: 34, z: -8 },
  { x: 32, z: 2 }, { x: 22, z: 8 }, { x: 12, z: 6 }, { x: 4, z: 10 },
  { x: -6, z: 18 }, { x: -18, z: 18 }, { x: -28, z: 10 }, { x: -34, z: 0 },
  { x: -32, z: -8 },
];

const classroomLabObstacles: TrackObstacle[] = [
  { id: 'table-a', kind: 'table', x: -10, z: 8, rotation: 0.15, scale: 1.1 },
  { id: 'chair-a1', kind: 'chair', x: -14, z: 10, rotation: 0.8 },
  { id: 'chair-a2', kind: 'chair', x: -6, z: 10, rotation: -0.4 },
  { id: 'chair-a3', kind: 'chair', x: -9, z: 4, rotation: 2.2 },
  { id: 'table-b', kind: 'table', x: 16, z: -2, rotation: -0.2, scale: 1.15 },
  { id: 'chair-b1', kind: 'chair', x: 12, z: -4, rotation: 0.4 },
  { id: 'chair-b2', kind: 'chair', x: 20, z: -4, rotation: -1.1 },
  { id: 'chair-b3', kind: 'chair', x: 16, z: 2, rotation: 1.8 },
  { id: 'table-c', kind: 'table', x: 2, z: -20, rotation: 0.05, scale: 1.0 },
  { id: 'chair-c1', kind: 'chair', x: -2, z: -22, rotation: 0.6 },
  { id: 'chair-c2', kind: 'chair', x: 6, z: -22, rotation: -0.2 },
  { id: 'cone-1', kind: 'cone', x: -20, z: -5, rotation: 0, scale: 1.0 },
  { id: 'cone-2', kind: 'cone', x: 26, z: 12, rotation: 0, scale: 1.0 },
  { id: 'cone-3', kind: 'cone', x: -2, z: 22, rotation: 0, scale: 1.0 },
];

const classroomLabBWaypoints: TrackPoint[] = [
  { x: -32, z: -20 }, { x: -22, z: -22 }, { x: -12, z: -16 }, { x: -4, z: -10 },
  { x: 8, z: -12 }, { x: 20, z: -20 }, { x: 32, z: -18 }, { x: 36, z: -6 },
  { x: 28, z: 4 }, { x: 16, z: 8 }, { x: 6, z: 4 }, { x: -2, z: 8 },
  { x: -10, z: 18 }, { x: -22, z: 20 }, { x: -34, z: 12 }, { x: -36, z: 0 },
  { x: -34, z: -10 },
];

const classroomLabBObstacles: TrackObstacle[] = [
  { id: 'table-b1', kind: 'table', x: -18, z: 4, rotation: 0.05, scale: 1.05 },
  { id: 'chair-b1a', kind: 'chair', x: -22, z: 6, rotation: 0.9 },
  { id: 'chair-b1b', kind: 'chair', x: -14, z: 6, rotation: -0.6 },
  { id: 'chair-b1c', kind: 'chair', x: -18, z: 0, rotation: 2.3 },
  { id: 'table-b2', kind: 'table', x: 10, z: -2, rotation: 0.35, scale: 1.2 },
  { id: 'chair-b2a', kind: 'chair', x: 6, z: -4, rotation: 0.2 },
  { id: 'chair-b2b', kind: 'chair', x: 14, z: -4, rotation: -0.9 },
  { id: 'chair-b2c', kind: 'chair', x: 10, z: 2, rotation: 1.6 },
  { id: 'table-b3', kind: 'table', x: 24, z: 14, rotation: -0.15, scale: 0.95 },
  { id: 'chair-b3a', kind: 'chair', x: 20, z: 16, rotation: 0.4 },
  { id: 'chair-b3b', kind: 'chair', x: 28, z: 16, rotation: -0.3 },
  { id: 'cone-b1', kind: 'cone', x: -4, z: -22, scale: 1.0 },
  { id: 'cone-b2', kind: 'cone', x: 34, z: 8, scale: 1.0 },
  { id: 'cone-b3', kind: 'cone', x: -30, z: 18, scale: 1.0 },
];

const classroomLabCWaypoints: TrackPoint[] = [
  { x: -30, z: -18 }, { x: -18, z: -18 }, { x: -8, z: -24 }, { x: 4, z: -24 },
  { x: 16, z: -16 }, { x: 28, z: -10 }, { x: 34, z: 0 }, { x: 28, z: 10 },
  { x: 16, z: 14 }, { x: 8, z: 22 }, { x: -4, z: 22 }, { x: -14, z: 14 },
  { x: -26, z: 10 }, { x: -34, z: 0 }, { x: -34, z: -10 },
];

const classroomLabCObstacles: TrackObstacle[] = [
  { id: 'table-c1', kind: 'table', x: -8, z: -6, rotation: -0.1, scale: 1.15 },
  { id: 'chair-c1a', kind: 'chair', x: -12, z: -8, rotation: 0.4 },
  { id: 'chair-c1b', kind: 'chair', x: -4, z: -8, rotation: -0.5 },
  { id: 'chair-c1c', kind: 'chair', x: -8, z: -2, rotation: 2.0 },
  { id: 'table-c2', kind: 'table', x: 18, z: 0, rotation: 0.2, scale: 1.05 },
  { id: 'chair-c2a', kind: 'chair', x: 14, z: -2, rotation: 0.8 },
  { id: 'chair-c2b', kind: 'chair', x: 22, z: -2, rotation: -0.2 },
  { id: 'chair-c2c', kind: 'chair', x: 18, z: 4, rotation: 1.7 },
  { id: 'table-c3', kind: 'table', x: 2, z: 14, rotation: -0.35, scale: 1.1 },
  { id: 'chair-c3a', kind: 'chair', x: -2, z: 16, rotation: 0.1 },
  { id: 'chair-c3b', kind: 'chair', x: 6, z: 16, rotation: -0.9 },
  { id: 'cone-c1', kind: 'cone', x: -22, z: -24, scale: 1.0 },
  { id: 'cone-c2', kind: 'cone', x: 30, z: 18, scale: 1.0 },
  { id: 'cone-c3', kind: 'cone', x: -34, z: 16, scale: 1.0 },
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
  },
  {
    id: 'classroom-lab',
    name: 'Classroom Lab',
    difficulty: 'special',
    description: 'Lab-like route with chairs and tables (sim-to-real practice)',
    environment: 'lab',
    width: 4.8,
    spawnPos: [-34, 0.5, -18],
    spawnRotation: computeSpawnRotation(-34, -18, classroomLabWaypoints),
    waypoints: classroomLabWaypoints,
    obstacles: classroomLabObstacles,
  },
  {
    id: 'classroom-lab-b',
    name: 'Classroom Lab B',
    difficulty: 'special',
    description: 'Alternate lab layout with shifted desks and tighter bends',
    environment: 'lab',
    width: 4.8,
    spawnPos: [-32, 0.5, -20],
    spawnRotation: computeSpawnRotation(-32, -20, classroomLabBWaypoints),
    waypoints: classroomLabBWaypoints,
    obstacles: classroomLabBObstacles,
  },
  {
    id: 'classroom-lab-c',
    name: 'Classroom Lab C',
    difficulty: 'special',
    description: 'Lab slalom variant with wider visuals and table clusters',
    environment: 'lab',
    width: 4.6,
    spawnPos: [-30, 0.5, -18],
    spawnRotation: computeSpawnRotation(-30, -18, classroomLabCWaypoints),
    waypoints: classroomLabCWaypoints,
    obstacles: classroomLabCObstacles,
  },
];

export function getTrack(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) || TRACKS[0];
}
