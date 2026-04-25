/**
 * Track definitions — each track is a series of waypoints forming a closed loop.
 * The car follows these waypoints, and boundaries are computed from them.
 */

export interface TrackPoint {
  x: number;
  z: number;
}

export interface TrackPointNode {
  id: string;
  x: number;
  z: number;
  width: number;
  nextTrackPointIds: string[]; // Stores the IDs of connected nodes (Edges)
}

export interface TrackObstacle {
  id: string;
  kind: "table" | "chair" | "cone" | "tree" | "bleachers" | "grandstand";
  x: number;
  z: number;
  rotation?: number;
  scale?: number;
}

export interface TrackDef {
  id: string;
  name: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "special";
  description: string;
  environment?: "outdoor" | "lab";
  width: number; // track half-width
  spawnPos: [number, number, number]; // x, y, z
  spawnRotation: number; // radians
  waypoints: TrackPoint[];
  waypointsGraph?: Record<string, TrackPointNode>;
  obstacles?: TrackObstacle[];
  unlockRequirement?: { totalClassLaps: number };
}

export function curveTrack(
  prefix: string,
  cx: number,
  cz: number, // Center X and Z
  rx: number,
  rz: number, // Radius X and Z
  numPoints: number,
  trackWidth: number,
  isClosedLoop: boolean, // toggle: True for full ovals, False for semi-circles
  startAngle: number = 0, // defaults to 0
  endAngle: number = Math.PI * 2, // defaults 360 degrees
): Record<string, TrackPointNode> {
  const tracks: Record<string, TrackPointNode> = {};

  // If it's a closed loop, divide by numPoints (so it doesn't overlap the start).
  // If it's an open arc, divide by numPoints - 1 (so it lands perfectly on the end).
  const divisor = isClosedLoop ? numPoints : numPoints - 1;

  for (let i = 0; i < numPoints; i++) {
    const fraction = i / divisor;
    const angle = startAngle + fraction * (endAngle - startAngle);

    const currentX = cx + Math.cos(angle) * rx;
    const currentZ = cz + Math.sin(angle) * rz;

    const currentId = `${prefix}-${i}`;
    const nextId = `${prefix}-${i + 1}`;

    const newNode: TrackPointNode = {
      id: currentId,
      x: currentX,
      z: currentZ,
      width: trackWidth,
      nextTrackPointIds: [],
    };

    if (i < numPoints - 1) {
      // Connect to the next node normally
      newNode.nextTrackPointIds.push(nextId);
    } else if (isClosedLoop) {
      // If it's the very last node, and it's a closed loop, point back to 0
      newNode.nextTrackPointIds.push(`${prefix}-0`);
    }

    // (If it's the last node and not a closed loop, pointer stays empty)
    tracks[currentId] = newNode;
  }
  //console.table(tracks);
  return tracks;
}
/*
export function sCurveTrack(
  prefix: string = "scurve",
  numPoints: number = 80,
  trackWidth: number = 4.5,
): Record<string, TrackPointNode> {
  const tracks: Record<string, TrackPointNode> = {};

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    const angle = t * Math.PI * 2;

    const currentX = Math.sin(angle) * 30 + Math.sin(angle * 2) * 12;
    const currentZ = Math.cos(angle) * 40;

    const currentId = `${prefix}-${i}`;
    const nextId = `${prefix}-${i + 1}`;

    const newNode: TrackPointNode = {
      id: currentId,
      x: currentX,
      z: currentZ,
      width: trackWidth,
      nextTrackPointIds: [],
    };

    // Draw the arrows: connect to the next node, or loop back to 0 at the end!
    if (i < numPoints - 1) {
      newNode.nextTrackPointIds.push(nextId);
    } else {
      newNode.nextTrackPointIds.push(`${prefix}-0`);
    }

    tracks[currentId] = newNode;
  }

  return tracks;
}
*/
export function straightawayTrack(
  prefix: string,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  numPoints: number,
  trackWidth: number,
): Record<string, TrackPointNode> {
  const tracks: Record<string, TrackPointNode> = {};

  for (let i = 0; i < numPoints; i++) {
    // The Lerp math to evenly space the waypoints
    const fraction = i / (numPoints - 1);
    const currentX = startX + fraction * (endX - startX);
    const currentZ = startZ + fraction * (endZ - startZ);

    const currentId = `${prefix}-${i}`;
    const nextId = `${prefix}-${i + 1}`;

    const newNode: TrackPointNode = {
      id: currentId,
      x: currentX,
      z: currentZ,
      width: trackWidth,
      nextTrackPointIds: [],
    };

    // Connect it to the next node in the straightaway
    if (i < numPoints - 1) {
      newNode.nextTrackPointIds.push(nextId);
    }

    tracks[currentId] = newNode;
  }

  return tracks;
}

function createStadiumTrack(): Record<string, TrackPointNode> {
  // 1. Generate the 4 track pieces
  const leftStraight = straightawayTrack("left", -20, -30, -20, 30, 10, 5);
  const topCurve = curveTrack("top", 0, 30, 20, 20, 10, 5, false, Math.PI, 0);
  const rightStraight = straightawayTrack("right", 20, 30, 20, -30, 10, 5);
  const bottomCurve = curveTrack(
    "bot",
    0,
    -30,
    20,
    20,
    10,
    5,
    false,
    Math.PI * 2,
    Math.PI,
  );

  const stadiumGraph = {
    ...leftStraight,
    ...topCurve,
    ...rightStraight,
    ...bottomCurve,
  };

  stadiumGraph["left-9"].nextTrackPointIds.push("top-0");
  stadiumGraph["top-9"].nextTrackPointIds.push("right-0");
  stadiumGraph["right-9"].nextTrackPointIds.push("bot-0");
  stadiumGraph["bot-9"].nextTrackPointIds.push("left-0");

  return stadiumGraph;
}

function createSTrack(): Record<string, TrackPointNode> {
  const straight1 = straightawayTrack("str1", 0, 60, 0, 40, 6, 5);

  const chicaneC1 = curveTrack(
    "c1",
    20,
    40,
    20,
    20,
    10,
    5,
    false,
    Math.PI,
    (3 * Math.PI) / 2,
  );

  const chicaneC2 = curveTrack(
    "c2",
    20,
    0,
    20,
    20,
    10,
    5,
    false,
    Math.PI / 2,
    0,
  );

  const straight2 = straightawayTrack("str2", 40, 0, 40, -40, 10, 5);

  const topCurve = curveTrack(
    "top",
    60,
    -40,
    20,
    20,
    10,
    5,
    false,
    Math.PI,
    Math.PI * 2,
  );

  const returnStraight = straightawayTrack("ret", 80, -40, 80, 60, 16, 5);

  const bottomCurve = curveTrack(
    "bot",
    40,
    60,
    40,
    20,
    15,
    5,
    false,
    0,
    Math.PI,
  );

  const sGraph = {
    ...straight1,
    ...chicaneC1,
    ...chicaneC2,
    ...straight2,
    ...topCurve,
    ...returnStraight,
    ...bottomCurve,
  };

  sGraph["str1-5"].nextTrackPointIds.push("c1-0");
  sGraph["c1-9"].nextTrackPointIds.push("c2-0");
  sGraph["c2-9"].nextTrackPointIds.push("str2-0");
  sGraph["str2-9"].nextTrackPointIds.push("top-0");
  sGraph["top-9"].nextTrackPointIds.push("ret-0");
  sGraph["ret-15"].nextTrackPointIds.push("bot-0");
  sGraph["bot-14"].nextTrackPointIds.push("str1-0");

  return sGraph;
}
/**
 * Compute the heading angle from the spawn point toward the nearest
 * next waypoint so the car faces along the track at start.
 */
function computeSpawnRotation(
  spawnX: number,
  spawnZ: number,
  waypoints: TrackPoint[],
): number {
  // Check if the track is using the new Graph system (empty array)
  if (waypoints.length === 0) {
    return 0;
  }

  // Find closest waypoint
  let closestIdx = 0;
  let closestDist = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const dx = waypoints[i].x - spawnX;
    const dz = waypoints[i].z - spawnZ;
    const d = dx * dx + dz * dz;
    if (d < closestDist) {
      closestDist = d;
      closestIdx = i;
    }
  }
  // Aim toward the next waypoint after the closest
  const nextIdx = (closestIdx + 1) % waypoints.length;
  const dx = waypoints[nextIdx].x - spawnX;
  const dz = waypoints[nextIdx].z - spawnZ;
  return Math.atan2(dx, dz);
}

function computeSpawnRotationGraph(
  spawnX: number,
  spawnZ: number,
  trackNodes: Record<string, TrackPointNode>,
): number {
  let closestNode: TrackPointNode | null = null;
  let closestDist = Infinity;

  // Find closest waypoint by looping through the dictionary
  for (const nodeId in trackNodes) {
    const node = trackNodes[nodeId];
    const dx = node.x - spawnX;
    const dz = node.z - spawnZ;
    const d = dx * dx + dz * dz;

    if (d < closestDist) {
      closestDist = d;
      closestNode = node;
    }
  }

  // If track is empty or node has no connections, default to 0
  if (!closestNode || closestNode.nextTrackPointIds.length === 0) {
    return 0;
  }

  // Find the next node using the ID in nextTrackPointIds
  const nextNodeId = closestNode.nextTrackPointIds[0];
  const nextNode = trackNodes[nextNodeId];

  if (!nextNode) return 0; // Check in case of a broken link

  const dx = nextNode.x - spawnX;
  const dz = nextNode.z - spawnZ;
  return Math.atan2(dx, dz);
}

// Helper function
function graphToArray(
  graph: Record<string, TrackPointNode>,
  startId?: string,
): TrackPoint[] {
  const cleanPath: TrackPoint[] = [];
  const visited = new Set<string>();

  let currentId = startId || Object.keys(graph)[0];

  while (currentId && !visited.has(currentId)) {
    const node = graph[currentId];
    if (!node) break;

    visited.add(currentId);

    const prevNode = cleanPath[cleanPath.length - 1];
    if (
      !prevNode ||
      Math.abs(node.x - prevNode.x) > 0.1 ||
      Math.abs(node.z - prevNode.z) > 0.1
    ) {
      cleanPath.push({ x: node.x, z: node.z });
    }

    currentId = node.nextTrackPointIds[0];
  }

  if (cleanPath.length > 1) {
    const firstNode = cleanPath[0];
    const lastNode = cleanPath[cleanPath.length - 1];

    if (
      Math.abs(firstNode.x - lastNode.x) < 0.1 &&
      Math.abs(firstNode.z - lastNode.z) < 0.1
    ) {
      cleanPath.pop();
    }
  }

  return cleanPath;
}

const ovalWaypoints = curveTrack("oval", 0, 0, 30, 20, 64, 5, true);
const nascarRacingWaypoints = curveTrack("oval", 0, 0, 62, 38, 96, 7.5, true);
const stadiumWaypoints = createStadiumTrack();
const sCurveWaypoints = createSTrack();
const cityWaypoints: TrackPoint[] = [
  { x: -25, z: -25 },
  { x: -25, z: 25 },
  { x: -15, z: 30 },
  { x: 0, z: 25 },
  { x: 5, z: 15 },
  { x: 15, z: 10 },
  { x: 25, z: 15 },
  { x: 30, z: 25 },
  { x: 25, z: 30 },
  { x: 15, z: 25 },
  { x: 10, z: 15 },
  { x: 15, z: 5 },
  { x: 25, z: 0 },
  { x: 25, z: -15 },
  { x: 20, z: -25 },
  { x: 10, z: -30 },
  { x: 0, z: -25 },
  { x: -10, z: -30 },
  { x: -20, z: -28 },
];

const classroomLabWaypoints: TrackPoint[] = [
  { x: -34, z: -18 },
  { x: -22, z: -18 },
  { x: -12, z: -10 },
  { x: -2, z: -8 },
  { x: 8, z: -8 },
  { x: 18, z: -16 },
  { x: 30, z: -16 },
  { x: 34, z: -8 },
  { x: 32, z: 2 },
  { x: 22, z: 8 },
  { x: 12, z: 6 },
  { x: 4, z: 10 },
  { x: -6, z: 18 },
  { x: -18, z: 18 },
  { x: -28, z: 10 },
  { x: -34, z: 0 },
  { x: -32, z: -8 },
];

const classroomLabObstacles: TrackObstacle[] = [
  { id: "table-a", kind: "table", x: -10, z: 8, rotation: 0.15, scale: 1.1 },
  { id: "chair-a1", kind: "chair", x: -14, z: 10, rotation: 0.8 },
  { id: "chair-a2", kind: "chair", x: -6, z: 10, rotation: -0.4 },
  { id: "chair-a3", kind: "chair", x: -9, z: 4, rotation: 2.2 },
  { id: "table-b", kind: "table", x: 16, z: -2, rotation: -0.2, scale: 1.15 },
  { id: "chair-b1", kind: "chair", x: 12, z: -4, rotation: 0.4 },
  { id: "chair-b2", kind: "chair", x: 20, z: -4, rotation: -1.1 },
  { id: "chair-b3", kind: "chair", x: 16, z: 2, rotation: 1.8 },
  { id: "table-c", kind: "table", x: 2, z: -20, rotation: 0.05, scale: 1.0 },
  { id: "chair-c1", kind: "chair", x: -2, z: -22, rotation: 0.6 },
  { id: "chair-c2", kind: "chair", x: 6, z: -22, rotation: -0.2 },
  { id: "cone-1", kind: "cone", x: -20, z: -5, rotation: 0, scale: 1.0 },
  { id: "cone-2", kind: "cone", x: 26, z: 12, rotation: 0, scale: 1.0 },
  { id: "cone-3", kind: "cone", x: -2, z: 22, rotation: 0, scale: 1.0 },
];

const classroomLabBWaypoints: TrackPoint[] = [
  { x: -32, z: -20 },
  { x: -22, z: -22 },
  { x: -12, z: -16 },
  { x: -4, z: -10 },
  { x: 8, z: -12 },
  { x: 20, z: -20 },
  { x: 32, z: -18 },
  { x: 36, z: -6 },
  { x: 28, z: 4 },
  { x: 16, z: 8 },
  { x: 6, z: 4 },
  { x: -2, z: 8 },
  { x: -10, z: 18 },
  { x: -22, z: 20 },
  { x: -34, z: 12 },
  { x: -36, z: 0 },
  { x: -34, z: -10 },
];
// --- CUTOM S-TRACK WAYPOINTS ---
const serpentWaypoints: TrackPoint[] = [
  { x: 0, z: 0 },
  { x: 10, z: 5 },
  { x: 20, z: 15 },
  { x: 30, z: 20 },
  { x: 40, z: 15 },
  { x: 50, z: 5 },
  { x: 60, z: -5 },
  { x: 70, z: -15 },
  { x: 80, z: -20 },
  { x: 90, z: -15 },
  { x: 100, z: -5 },
  { x: 110, z: 0 },
];
const classroomLabBObstacles: TrackObstacle[] = [
  { id: "table-b1", kind: "table", x: -18, z: 4, rotation: 0.05, scale: 1.05 },
  { id: "chair-b1a", kind: "chair", x: -22, z: 6, rotation: 0.9 },
  { id: "chair-b1b", kind: "chair", x: -14, z: 6, rotation: -0.6 },
  { id: "chair-b1c", kind: "chair", x: -18, z: 0, rotation: 2.3 },
  { id: "table-b2", kind: "table", x: 10, z: -2, rotation: 0.35, scale: 1.2 },
  { id: "chair-b2a", kind: "chair", x: 6, z: -4, rotation: 0.2 },
  { id: "chair-b2b", kind: "chair", x: 14, z: -4, rotation: -0.9 },
  { id: "chair-b2c", kind: "chair", x: 10, z: 2, rotation: 1.6 },
  { id: "table-b3", kind: "table", x: 24, z: 14, rotation: -0.15, scale: 0.95 },
  { id: "chair-b3a", kind: "chair", x: 20, z: 16, rotation: 0.4 },
  { id: "chair-b3b", kind: "chair", x: 28, z: 16, rotation: -0.3 },
  { id: "cone-b1", kind: "cone", x: -4, z: -22, scale: 1.0 },
  { id: "cone-b2", kind: "cone", x: 34, z: 8, scale: 1.0 },
  { id: "cone-b3", kind: "cone", x: -30, z: 18, scale: 1.0 },
];

const classroomLabCWaypoints: TrackPoint[] = [
  { x: -30, z: -18 },
  { x: -18, z: -18 },
  { x: -8, z: -24 },
  { x: 4, z: -24 },
  { x: 16, z: -16 },
  { x: 28, z: -10 },
  { x: 34, z: 0 },
  { x: 28, z: 10 },
  { x: 16, z: 14 },
  { x: 8, z: 22 },
  { x: -4, z: 22 },
  { x: -14, z: 14 },
  { x: -26, z: 10 },
  { x: -34, z: 0 },
  { x: -34, z: -10 },
];

const classroomLabCObstacles: TrackObstacle[] = [
  { id: "table-c1", kind: "table", x: -8, z: -6, rotation: -0.1, scale: 1.15 },
  { id: "chair-c1a", kind: "chair", x: -12, z: -8, rotation: 0.4 },
  { id: "chair-c1b", kind: "chair", x: -4, z: -8, rotation: -0.5 },
  { id: "chair-c1c", kind: "chair", x: -8, z: -2, rotation: 2.0 },
  { id: "table-c2", kind: "table", x: 18, z: 0, rotation: 0.2, scale: 1.05 },
  { id: "chair-c2a", kind: "chair", x: 14, z: -2, rotation: 0.8 },
  { id: "chair-c2b", kind: "chair", x: 22, z: -2, rotation: -0.2 },
  { id: "chair-c2c", kind: "chair", x: 18, z: 4, rotation: 1.7 },
  { id: "table-c3", kind: "table", x: 2, z: 14, rotation: -0.35, scale: 1.1 },
  { id: "chair-c3a", kind: "chair", x: -2, z: 16, rotation: 0.1 },
  { id: "chair-c3b", kind: "chair", x: 6, z: 16, rotation: -0.9 },
  { id: "cone-c1", kind: "cone", x: -22, z: -24, scale: 1.0 },
  { id: "cone-c2", kind: "cone", x: 30, z: 18, scale: 1.0 },
  { id: "cone-c3", kind: "cone", x: -34, z: 16, scale: 1.0 },
];

const nascarRacingObstacles: TrackObstacle[] = [
  {
    id: "nascar-bleachers-n",
    kind: "bleachers",
    x: 0,
    z: -58,
    rotation: 0,
    scale: 1.35,
  },
  {
    id: "nascar-bleachers-s",
    kind: "bleachers",
    x: 0,
    z: 58,
    rotation: Math.PI,
    scale: 1.35,
  },
  {
    id: "nascar-grandstand-e",
    kind: "grandstand",
    x: 86,
    z: 0,
    rotation: -Math.PI / 2,
    scale: 1.4,
  },
  {
    id: "nascar-grandstand-w",
    kind: "grandstand",
    x: -86,
    z: 0,
    rotation: Math.PI / 2,
    scale: 1.4,
  },
  { id: "nascar-tree-1", kind: "tree", x: 78, z: -46, scale: 1.1 },
  { id: "nascar-tree-2", kind: "tree", x: 93, z: -28, scale: 0.95 },
  { id: "nascar-tree-3", kind: "tree", x: 96, z: 16, scale: 1.0 },
  { id: "nascar-tree-4", kind: "tree", x: 85, z: 44, scale: 1.2 },
  { id: "nascar-tree-5", kind: "tree", x: 56, z: 63, scale: 1.1 },
  { id: "nascar-tree-6", kind: "tree", x: 18, z: 70, scale: 0.95 },
  { id: "nascar-tree-7", kind: "tree", x: -22, z: 70, scale: 1.05 },
  { id: "nascar-tree-8", kind: "tree", x: -60, z: 64, scale: 1.15 },
  { id: "nascar-tree-9", kind: "tree", x: -88, z: 44, scale: 0.95 },
  { id: "nascar-tree-10", kind: "tree", x: -96, z: 8, scale: 1.0 },
  { id: "nascar-tree-11", kind: "tree", x: -90, z: -34, scale: 1.2 },
  { id: "nascar-tree-12", kind: "tree", x: -58, z: -62, scale: 1.05 },
  { id: "nascar-tree-13", kind: "tree", x: -18, z: -70, scale: 1.0 },
  { id: "nascar-tree-14", kind: "tree", x: 24, z: -69, scale: 1.15 },
  { id: "nascar-tree-15", kind: "tree", x: 61, z: -62, scale: 0.9 },
];

export const TRACKS: TrackDef[] = [
  {
    id: "oval",
    name: "Oval",
    difficulty: "beginner",
    description: "Simple loop — learn the controls",
    width: 5,
    spawnPos: [30, 0.5, 0],
    spawnRotation: computeSpawnRotationGraph(30, 0, ovalWaypoints),
    waypoints: graphToArray(ovalWaypoints),
    waypointsGraph: ovalWaypoints,
  },
  {
    id: "stadium",
    name: "Stadium",
    difficulty: "beginner",
    description: "A continuous loop made of straightaways and semicircles",
    width: 5,
    spawnPos: [20, 0.5, 30],
    spawnRotation: computeSpawnRotationGraph(20, 30, stadiumWaypoints),
    waypoints: graphToArray(stadiumWaypoints, "right-0"),
    waypointsGraph: stadiumWaypoints,
  },
  {
    id: "nascar-racing-track",
    name: "nascar racing track",
    difficulty: "beginner",
    description:
      "Large easy oval inspired by stock car circuits, with open sight lines",
    environment: "outdoor",
    width: 7.5,
    spawnPos: [62, 0.5, 0],
    spawnRotation: computeSpawnRotationGraph(62, 0, nascarRacingWaypoints),
    waypoints: graphToArray(nascarRacingWaypoints),
    waypointsGraph: nascarRacingWaypoints,
    obstacles: nascarRacingObstacles,
  },
  {
    id: "s-curves",
    name: "S-Curves",
    difficulty: "intermediate",
    description: "Tests smooth steering transitions",
    width: 5,

    // Drop the car at the new start of the entrance straightaway
    spawnPos: [0, 0.5, 60],
    spawnRotation: computeSpawnRotationGraph(0, 60, sCurveWaypoints),

    waypoints: graphToArray(sCurveWaypoints, "str1-0"),
    waypointsGraph: sCurveWaypoints,
  },
  // --- S-TRACK ADDED-INVIRONMENT
  {
    id: "serpent-s",
    name: "The Serpent",
    difficulty: "intermediate",
    description: "A custom S-shaped challenge",
    width: 5.0,
    spawnPos: [0, 0.5, 0],
    spawnRotation: computeSpawnRotation(0, 0, serpentWaypoints),
    waypoints: serpentWaypoints,
  },
  {
    id: "city-circuit",
    name: "City Circuit",
    difficulty: "advanced",
    description: "Tight turns, intersections",
    width: 4,
    spawnPos: [-25, 0.5, -25],
    spawnRotation: computeSpawnRotation(-25, -25, cityWaypoints),
    waypoints: [
      { x: -25, z: -25 },
      { x: -25, z: 25 },
      { x: -15, z: 30 },
      { x: 0, z: 25 },
      { x: 5, z: 15 },
      { x: 15, z: 10 },
      { x: 25, z: 15 },
      { x: 30, z: 25 },
      { x: 25, z: 30 },
      { x: 15, z: 25 },
      { x: 10, z: 15 },
      { x: 15, z: 5 },
      { x: 25, z: 0 },
      { x: 25, z: -15 },
      { x: 20, z: -25 },
      { x: 10, z: -30 },
      { x: 0, z: -25 },
      { x: -10, z: -30 },
      { x: -20, z: -28 },
    ],
  },
  {
    id: "classroom-lab",
    name: "Classroom Lab",
    difficulty: "special",
    description: "Lab-like route with chairs and tables (sim-to-real practice)",
    environment: "lab",
    width: 4.8,
    spawnPos: [-34, 0.5, -18],
    spawnRotation: computeSpawnRotation(-34, -18, classroomLabWaypoints),
    waypoints: classroomLabWaypoints,
    obstacles: classroomLabObstacles,
  },
  {
    id: "classroom-lab-b",
    name: "Classroom Lab B",
    difficulty: "special",
    description: "Alternate lab layout with shifted desks and tighter bends",
    environment: "lab",
    width: 4.8,
    spawnPos: [-32, 0.5, -20],
    spawnRotation: computeSpawnRotation(-32, -20, classroomLabBWaypoints),
    waypoints: classroomLabBWaypoints,
    obstacles: classroomLabBObstacles,
  },
  {
    id: "classroom-lab-c",
    name: "Classroom Lab C",
    difficulty: "special",
    description: "Lab slalom variant with wider visuals and table clusters",
    environment: "lab",
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
