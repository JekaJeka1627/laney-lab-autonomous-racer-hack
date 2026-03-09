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
  neighbors: string[]; // Stores the IDs of connected nodes (Edges)
}

export class TrackGraph {
  public nodes: Map<string, TrackPointNode> = new Map();

  // Add a new node to the graph
  addNode(id: string, x: number, z: number): void {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, x, z, neighbors: [] });
    }
  }

  // Create a directed edge from one node to another
  addEdge(fromId: string, toId: string): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (fromNode && toNode && !fromNode.neighbors.includes(toId)) {
      fromNode.neighbors.push(toId);
    }
  }

  // Create a bidirectional edge (useful for the straightaway)
  addBidirectionalEdge(id1: string, id2: string): void {
    this.addEdge(id1, id2);
    this.addEdge(id2, id1);
  }
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
  waypoints: TrackPoint[] | TrackPointNode[];
  obstacles?: TrackObstacle[];
  unlockRequirement?: { totalClassLaps: number };
}

function ovalTrack(
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  n: number,
): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(angle) * rx, z: cz + Math.sin(angle) * rz });
  }
  return pts;
}

function buildConnectedOvalsGraph(
  nodesPerOval: number,
  straightNodes: number,
): TrackGraph {
  const graph = new TrackGraph();

  const leftCenter = { x: -40, z: 0 };
  const rightCenter = { x: 40, z: 0 };
  const ovalRadiusX = 20;
  const ovalRadiusZ = 30;

  // Build Left Oval Nodes & Internal Edges
  for (let i = 0; i < nodesPerOval; i++) {
    const angle = (i / nodesPerOval) * Math.PI * 2;
    const id = `L-${i}`;
    graph.addNode(
      id,
      leftCenter.x + Math.cos(angle) * ovalRadiusX,
      leftCenter.z + Math.sin(angle) * ovalRadiusZ,
    );

    // Connect to the previous node to form the loop
    if (i > 0) graph.addEdge(`L-${i - 1}`, id);
  }
  graph.addEdge(`L-${nodesPerOval - 1}`, "L-0"); // Close the left loop

  // Build Right Oval Nodes & Internal Edges
  for (let i = 0; i < nodesPerOval; i++) {
    const angle = (i / nodesPerOval) * Math.PI * 2;
    const id = `R-${i}`;
    graph.addNode(
      id,
      rightCenter.x + Math.cos(angle) * ovalRadiusX,
      rightCenter.z + Math.sin(angle) * ovalRadiusZ,
    );

    if (i > 0) graph.addEdge(`R-${i - 1}`, id);
  }
  graph.addEdge(`R-${nodesPerOval - 1}`, "R-0"); // Close the right loop

  // Build Straightaway Nodes (Connecting the inner edges of both ovals)
  const startX = graph.nodes.get("L-0")!.x;
  const endX = graph.nodes.get("R-8")!.x;

  for (let i = 0; i <= straightNodes; i++) {
    const id = `S-${i}`;
    const t = i / straightNodes;
    const xPos = startX + t * (endX - startX);
    graph.addNode(id, xPos, 0); // Z is 0 for a straight horizontal line

    if (i > 0) graph.addBidirectionalEdge(`S-${i - 1}`, id);
  }

  // Hook the straightaway into the ovals
  // Connect Left Oval to the start of the straightaway
  graph.addBidirectionalEdge("L-0", "S-0");

  // Connect Right Oval to the end of the straightaway
  graph.addBidirectionalEdge("R-8", `S-${straightNodes}`);

  return graph;
}

function extractPathFromGraph(
  graph: TrackGraph,
  routeIds: string[],
): TrackPoint[] {
  const path: TrackPoint[] = [];
  for (const id of routeIds) {
    const node = graph.nodes.get(id);
    if (node) {
      path.push({ x: node.x, z: node.z });
    } else {
      console.warn(`Node ${id} not found in graph!`);
    }
  }
  return path;
}

function generateBarbellRoute(
  nodesPerOval: number,
  straightNodes: number,
): string[] {
  const route: string[] = [];
  const halfOval = Math.floor(nodesPerOval / 2);

  for (let i = halfOval; i < nodesPerOval; i++) {
    route.push(`L-${i}`);
  }

  route.push("L-0");
  for (let i = 1; i <= straightNodes; i++) {
    route.push(`S-${i}`);
  }

  for (let i = 0; i <= nodesPerOval; i++) {
    const nodeIndex = (halfOval + i) % nodesPerOval;
    route.push(`R-${nodeIndex}`);
  }

  for (let i = straightNodes - 1; i >= 1; i--) {
    route.push(`S-${i}`);
  }

  for (let i = 0; i < halfOval; i++) {
    route.push(`L-${i}`);
  }

  return route;
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
function computeSpawnRotation(
  spawnX: number,
  spawnZ: number,
  waypoints: TrackPoint[],
): number {
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

// Graph-specific version of the rotation logic.
function computeSpawnRotationFromGraph(
  spawnNodeId: string,
  targetNodeId: string,
  graph: TrackGraph,
): number {
  const start = graph.nodes.get(spawnNodeId);
  const target = graph.nodes.get(targetNodeId);

  if (!start || !target) return 0;

  const dx = target.x - start.x;
  const dz = target.z - start.z;

  return Math.atan2(dx, dz);
}

const OVAL_RESOLUTION = 16;
const STRAIGHT_RESOLUTION = 5;

const myEnvironmentGraph = buildConnectedOvalsGraph(
  OVAL_RESOLUTION,
  STRAIGHT_RESOLUTION,
);

const barbellRoute = generateBarbellRoute(OVAL_RESOLUTION, STRAIGHT_RESOLUTION);

const ovalWaypointsGraph = extractPathFromGraph(
  myEnvironmentGraph,
  barbellRoute,
);

const startNode = myEnvironmentGraph.nodes.get(barbellRoute[0])!;

const nascarRacingWaypoints = ovalTrack(0, 0, 62, 38, 96);
const sCurveWaypoints = sCurveTrack();
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
    spawnRotation: computeSpawnRotation(30, 0, ovalWaypointsGraph),
    waypoints: ovalWaypointsGraph,
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
    spawnRotation: computeSpawnRotation(62, 0, nascarRacingWaypoints),
    waypoints: nascarRacingWaypoints,
    obstacles: nascarRacingObstacles,
  },
  {
    id: "double-oval-w-straightaway-graph",
    name: "Barbell Track",
    difficulty: "intermediate",
    description: "A procedural track built from a waypoint graph.",
    width: 5.0,
    spawnPos: [startNode.x, 0.5, startNode.z],
    spawnRotation: computeSpawnRotationFromGraph(
      barbellRoute[0],
      barbellRoute[1],
      myEnvironmentGraph,
    ),
    waypoints: ovalWaypointsGraph,
  },
  {
    id: "s-curves",
    name: "S-Curves",
    difficulty: "intermediate",
    description: "Tests smooth steering transitions",
    width: 4.5,
    spawnPos: [0, 0.5, -40],
    spawnRotation: computeSpawnRotation(0, -40, sCurveWaypoints),
    waypoints: sCurveWaypoints,
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
