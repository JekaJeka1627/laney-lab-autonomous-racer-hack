# Environment Roadmap

## Overview

The simulator evolves through four phases, each adding realism and training value.
Every phase produces driving data that trains the shared model. Later phases close
the sim-to-real domain gap so the model transfers cleanly to the physical vehicle.

---

## Phase 1 — Closed Tracks (DONE)

**Goal:** Get the core loop working. Drive → capture data → train → AI drives.

**Environments:**
- Oval (beginner) — simple loop
- S-Curves (intermediate) — smooth steering practice
- City Circuit (advanced) — tight turns, intersections

**What humans contribute:**
- Diverse driving lines (30 students = 30 different approaches)
- Recovery behavior (going off-track and correcting)
- Speed variation (cautious vs aggressive)

**Training value:** The model learns basic lane-following from camera frames.

**Status:** ✅ Complete — 3D tracks, car physics, HUD, minimap, AI demo mode.

---

## Phase 2 — Bigger Tracks with Choices

**Goal:** Make driving more engaging. Add decision points that generate richer data.

**Environments:**
- **Explorer Track** — large track with forks, intersections, and branching paths
  - Left/right choice at a Y-junction
  - Roundabout section
  - Narrow alley → wide boulevard transitions
  - Parking lot area with scattered obstacles (cones, barriers)
  - Straightaway for speed runs
- **Obstacle Course v2** — dynamic obstacles that move or appear randomly
- **Night Mode** — reduced visibility, headlights illuminate only the road ahead

**What humans contribute:**
- **Decision-making data** — the model learns that multiple paths are valid
- **Obstacle avoidance** — humans naturally dodge things; the model learns this
- **Varied speed profiles** — slow in tight areas, fast on straights
- **Low-visibility driving** — teaches the model to work with limited visual info

**Training value:** The model learns generalized driving, not just one track.

**New features needed:**
- Track branching (waypoint graph instead of single loop)
- Obstacle spawning system
- Night lighting mode (spotlight on car, dark environment)
- Checkpoint system (for non-loop tracks)

**Timeline:** Next sprint

---

## Phase 3 — Open Campus Map

**Goal:** Free-form driving in a structured environment. Students explore and
generate diverse, naturalistic driving data.

**Environment:**
- Small open-world map (~200m × 200m)
- Roads with intersections, stop signs, crosswalks
- Buildings (simple blocks with textures)
- Parking areas
- Green spaces / sidewalks
- Multiple valid routes between waypoints

**Gameplay:**
- **Waypoint missions** — "Drive from Building A to Building B"
- **Delivery challenges** — timed routes between locations
- **Free roam** — drive anywhere, all data captured
- **Traffic** — other AI cars on the road (later)

**What humans contribute:**
- **Navigation decisions** — route planning, not just lane-following
- **Intersection behavior** — stopping, turning, yielding
- **Parking maneuvers** — tight low-speed control
- **Natural driving patterns** — acceleration, cruising, braking profiles

**Training value:** The model learns to drive in complex environments with
multiple valid behaviors. This is critical for real-world deployment.

**New features needed:**
- Tile-based or procedural map system
- Intersection logic (stop zones, turn signals)
- Waypoint mission system
- Simple building/environment models

**Timeline:** Mid-semester

---

## Phase 4 — Photo-Realistic Lab & Quad Map

**Goal:** Close the sim-to-real domain gap. Train the model in a simulator that
looks like the actual deployment environment.

### The Approach

1. **Capture photos** of the real environment:
   - Lab interior (hallways, floor texture, walls, doors, furniture)
   - Quad area outside (pathways, grass, benches, trees, buildings)
   - Take 50–100 overlapping photos from multiple angles
   - Include different lighting conditions (morning, afternoon, overcast)

2. **Generate 3D reconstruction:**
   - **Option A: Photogrammetry** (Meshroom or COLMAP)
     - Input: photos → Output: textured 3D mesh (.obj/.glb)
     - Mature, well-understood pipeline
     - Good for static environments
   - **Option B: Gaussian Splatting** (Nerfstudio / 3DGS)
     - Input: photos + camera poses → Output: point cloud splat
     - Newer, higher visual quality, faster rendering
     - Three.js has splat renderers available
   - **Option C: Hybrid**
     - Use photogrammetry for the base mesh (collision, navigation)
     - Overlay Gaussian splats for visual fidelity

3. **Import into simulator:**
   - Load the 3D mesh/splat as a Three.js scene
   - Define driveable surfaces (road/floor polygons)
   - Place spawn points and waypoints
   - Match camera FOV and height to the physical vehicle's camera

4. **Drive in the reconstructed environment:**
   - Students drive through the virtual lab and quad
   - Camera frames look like real photos of the actual space
   - Steering/speed data pairs with realistic visual input

### Why This Works for Sim-to-Real

The #1 failure mode in sim-to-real transfer is the **domain gap**:
- Sim: clean textures, perfect lighting, no shadows
- Real: messy textures, variable lighting, shadows, reflections

By reconstructing the real environment, we minimize this gap:

| Property | Generic Sim | Photo-Realistic Sim | Real World |
|----------|------------|-------------------|------------|
| Floor texture | Flat gray | Actual lab floor | Actual lab floor |
| Walls | Solid color | Real wall photos | Real walls |
| Lighting | Uniform | Captured lighting | Variable |
| Objects | None | Real furniture/obstacles | Real furniture |
| Camera view | Synthetic | Matches real camera | Real camera |

The model trained on Phase 4 data should transfer to the physical vehicle
with minimal fine-tuning.

### Tools

| Tool | Purpose | Link |
|------|---------|------|
| Meshroom | Open-source photogrammetry | https://alicevision.org/meshroom |
| COLMAP | Structure-from-motion + MVS | https://colmap.github.io |
| Nerfstudio | NeRF/Gaussian splatting toolkit | https://nerf.studio |
| Three.js GLB loader | Load reconstructed meshes | Built into R3F |
| gsplat.js | Gaussian splat renderer for Three.js | https://github.com/huggingface/gsplat.js |

### Photo Capture Guide (for students)

1. Use a phone camera (12MP+ is fine)
2. Walk slowly through the space
3. Take overlapping photos every 1–2 steps (70%+ overlap)
4. Cover the space from multiple heights (standing, crouching)
5. Include the floor, walls, ceiling, and all obstacles
6. Shoot in consistent lighting (avoid mixed sun/shade if possible)
7. Aim for 50–100 photos per area (lab interior, quad exterior)

### Parity Requirements (from Deployment Spec)

The simulator camera must match the physical vehicle:
- Same resolution (or downscaled consistently)
- Same field of view
- Same mounting height
- Same color space (RGB)
- Same preprocessing pipeline

This ensures the model sees the same visual features in sim and on the car.

**Timeline:** End of semester / final project milestone

---

## Data Value by Phase

| Phase | Data Type | Model Learns |
|-------|-----------|-------------|
| 1 | Simple laps on closed tracks | Basic steering from camera |
| 2 | Complex tracks with choices | Generalized driving + obstacle avoidance |
| 3 | Open-world navigation | Route planning + intersection behavior |
| 4 | Photo-realistic environment | Real-world visual features → direct transfer |

Each phase builds on the last. The model improves continuously as the class
generates more data across increasingly realistic environments.

---

## Summary

```
Phase 1: Learn to drive          (closed tracks)        ✅ DONE
Phase 2: Learn to decide         (branching tracks)     🔜 NEXT
Phase 3: Learn to navigate       (open campus map)      📋 PLANNED
Phase 4: Learn the real world    (photo-realistic sim)  🎯 GOAL
```

The end state: a model trained in a simulator that looks like the real lab,
deployed to a physical car that drives in that same lab. The class built the
dataset, trained the model, and watched it go from zero to autonomous.
