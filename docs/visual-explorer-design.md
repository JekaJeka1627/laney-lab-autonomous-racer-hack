# Visual Explorer: Camera-Only Autonomous Exploration with Return-to-Home

## Concept

A DeepRacer mode that explores an environment without a track, builds a
visual memory of where it has been, creates its own waypoints from visual
features, avoids obstacles using monocular depth, and can retrace its path
back to the starting point -- all using cameras only (no LIDAR, no QR codes,
no GPS).

## Hardware

- DeepRacer unit with built-in front-facing camera (480p)
- Extra USB camera mounted rear-facing or angled for stereo depth
  (or wider FOV for obstacle detection)
- Standard DeepRacer compute (Intel Atom with OpenVINO support)

## Architecture Overview

```text
  Front Camera          USB Camera (side/rear)
       |                       |
       v                       v
  [Visual Odometry]    [Obstacle Detector]
       |                       |
       v                       v
  [Feature Extractor]  [Depth Estimator]
       |                       |
       +----------+------------+
                  |
                  v
         [World Memory Module]
         - Visual landmark DB
         - Odometry trail (breadcrumbs)
         - Obstacle map (2D grid)
                  |
                  v
         [Navigation Planner]
         - Explore: frontier-based, prefer open space
         - Return: follow breadcrumbs in reverse
         - Avoid: steer away from obstacles
                  |
                  v
         [Steering/Throttle Controller]
                  |
                  v
            DeepRacer Servos
```

## Module Breakdown

### 1. Visual Odometry (position tracking without GPS)

Tracks the car's movement by matching visual features between consecutive
camera frames. Provides a running estimate of position (x, y) and heading.

**Implementation:**

- Use ORB feature detector (OpenCV, fast, no GPU needed)
- Match features between frame N and frame N-1
- Compute essential matrix to estimate rotation + translation
- Accumulate into a running pose estimate
- Drift correction: when revisiting a known landmark, snap position

**Libraries:** OpenCV (`cv2.ORB_create`, `cv2.BFMatcher`)

**Key constraint:** Monocular visual odometry has scale ambiguity -- we
won't know absolute distances, but relative positions are sufficient for
return-to-home since we only need to retrace the path.

### 2. Visual Landmark Database (world memory)

Stores distinctive visual features at each waypoint the car creates.
When the car sees a similar feature pattern later, it recognizes it has
been there before.

**Implementation:**

- Every N frames (e.g., every 30 frames = ~2 seconds), save a "landmark":
  - ORB feature descriptors from the current frame
  - Estimated (x, y, heading) from visual odometry
  - Thumbnail image (64x64) for debugging
  - Timestamp
- To recognize a place: match current ORB descriptors against stored
  landmarks using BFMatcher with ratio test
- If match quality > threshold: "I have been here before"

**Data structure:**

```python
@dataclass
class VisualLandmark:
    landmark_id: int
    position: tuple[float, float]  # (x, y) from odometry
    heading: float                  # radians
    descriptors: np.ndarray         # ORB descriptors
    thumbnail: np.ndarray           # 64x64 RGB
    timestamp: float
    visit_count: int = 1
```

### 3. Obstacle Detection (camera-only depth)

Detects obstacles using monocular depth estimation from the front camera.
The extra USB camera can provide a second viewpoint for stereo depth if
mounted with a known baseline.

#### Option A: Monocular depth (single camera, simpler)

- Use MiDaS Small ONNX model (runs on CPU at ~10 FPS on Intel Atom)
- Produces a relative depth map from a single RGB image
- Threshold depth map to find "close" obstacles
- Divide frame into 3 sectors: left / center / right
- Each sector reports: clear / caution / blocked

#### Option B: Stereo depth (two cameras, more accurate)

If the USB camera is mounted beside the built-in camera with a known
baseline (e.g., 10cm apart):

- Rectify both camera images
- Compute stereo disparity map (OpenCV `StereoSGBM`)
- Convert disparity to depth (depth = baseline * focal_length / disparity)
- Real metric distances (not just relative)

Start with Option A (monocular MiDaS). Upgrade to
stereo if the extra camera can be rigidly mounted with a stable baseline.

### 4. Navigation Planner

The brain of the explorer. Three modes:

#### Explore Mode

- **Goal:** Cover new ground while avoiding obstacles
- **Strategy:** Frontier-based exploration
  1. If path ahead is clear: drive forward
  2. If obstacle detected: turn toward the clearest sector
  3. Prefer directions the car has NOT visited (check landmark DB)
  4. Drop a landmark every N frames
  5. Maintain a "breadcrumb trail" of (x, y, heading) positions

```python
def plan_explore(obstacles, landmarks, odometry):
    left, center, right = obstacles.sectors

    if center == "clear":
        # Check if we have been here before
        if not landmarks.is_revisit(odometry.position):
            return Action(steering=0.0, throttle=0.5)  # go straight
        else:
            # Already visited -- prefer turning to new area
            return Action(steering=0.3 if left == "clear" else -0.3,
                          throttle=0.3)

    # Obstacle ahead -- turn toward clearest side
    if left == "clear" and right != "clear":
        return Action(steering=-0.5, throttle=0.3)
    elif right == "clear" and left != "clear":
        return Action(steering=0.5, throttle=0.3)
    else:
        # Both sides have something -- pick the less visited direction
        return Action(steering=landmarks.least_visited_direction(),
                      throttle=0.2)
```

#### Return-to-Home Mode

- **Goal:** Navigate back to the starting position
- **Strategy:** Follow the breadcrumb trail in reverse

```python
def plan_return(breadcrumbs, odometry, obstacles):
    if len(breadcrumbs) == 0:
        return Action(steering=0.0, throttle=0.0)  # home!

    # Next breadcrumb to reach (working backward through the trail)
    target = breadcrumbs[-1]

    # Compute steering toward target
    dx = target.x - odometry.x
    dy = target.y - odometry.y
    target_heading = atan2(dy, dx)
    heading_error = normalize_angle(target_heading - odometry.heading)

    steering = clip(heading_error * STEERING_GAIN, -1.0, 1.0)
    throttle = 0.3  # slow and careful on return

    # If close enough to this breadcrumb, pop it and target the next one
    if distance(odometry.position, target.position) < WAYPOINT_RADIUS:
        breadcrumbs.pop()

    # Still avoid obstacles even on the return trip
    if obstacles.center == "blocked":
        steering = obstacles.escape_steering()

    return Action(steering=steering, throttle=throttle)
```

#### Safety Mode

- Emergency stop if obstacles are very close in all sectors
- Timeout if no progress for N seconds (stuck detection)
- Battery low: trigger return-to-home automatically

### 5. Steering/Throttle Controller

Maps planner outputs to DeepRacer servo commands. Reuses the existing
vehicle runtime's actuator interface.

## State Machine

```text
                     START
                       |
                       v
     +----------> [EXPLORING] <---------+
     |                 |                 |
     |     obstacle    |    user         |
     |     detected    |    command      |
     |         |       v        |        |
     |         v   [AVOIDING]   |        |
     |         |       |        |        |
     |         +-------+        |        |
     |                          v        |
     |                   [RETURNING]     |
     |                       |           |
     |            reached    |  stuck    |
     |            home       |           |
     |               |       +-----------+
     |               v
     |            [HOME]
     |               |
     |    user says  |
     |    explore    |
     +-again---------+
```

## What Makes This Different from QR Offroad

| Feature | QR Offroad | Visual Explorer |
| --- | --- | --- |
| Waypoint source | Pre-placed QR codes | Self-generated from visual features |
| Setup required | Print and place QR codes | None -- just set the car down |
| Path type | Fixed sequence | Autonomous discovery |
| Return-to-home | Follow QR sequence backward | Follow visual breadcrumb trail |
| Obstacle avoidance | None (basic) | Monocular depth or stereo |
| World memory | None | Visual landmark database |
| Place recognition | QR decode | ORB feature matching |
| Works outdoors | If QR codes are visible | Yes (features work everywhere) |

## Implementation Plan

### Phase 1: Foundation (MVP)

Goal: Car drives forward, avoids obstacles, drops breadcrumbs, returns home.

1. **Obstacle detector** -- MiDaS Small ONNX, 3-sector output
2. **Simple odometry** -- wheel encoder integration (if available) or
   frame-counting with assumed speed
3. **Breadcrumb trail** -- save (x, y, heading) every N frames
4. **Return-to-home** -- follow breadcrumbs in reverse
5. **Safety stops** -- emergency stop on close obstacles

Estimated effort: 2-3 days

### Phase 2: Visual Memory

Goal: Car recognizes places it has been and prefers exploring new areas.

1. **ORB feature extractor** -- extract features every N frames
2. **Visual landmark DB** -- store and match landmarks
3. **Place recognition** -- "I have been here before" detection
4. **Exploration bias** -- prefer unvisited directions
5. **Loop closure** -- correct odometry drift when revisiting landmarks

Estimated effort: 3-5 days

### Phase 3: Visual Odometry

Goal: Accurate position tracking from camera alone.

1. **Feature matching between frames** -- ORB + BFMatcher
2. **Essential matrix estimation** -- rotation + translation per frame
3. **Pose accumulation** -- running (x, y, heading) estimate
4. **Drift correction** -- snap to known landmarks on recognition
5. **Stereo depth** (if USB camera baseline is stable)

Estimated effort: 5-7 days

### Phase 4: Polish

1. **2D map visualization** -- real-time map of explored area on dashboard
2. **Battery-aware return** -- trigger return when battery drops below threshold
3. **Multi-session memory** -- save/load landmark DB between runs
4. **Exploration coverage metric** -- how much area has been covered
5. **Integration with Streamlit dashboard** -- live exploration view

## Dependencies

All can run on the DeepRacer's Intel Atom CPU:

- **OpenCV** (4.x) -- ORB features, stereo matching, image processing
- **onnxruntime** -- MiDaS depth model inference
- **NumPy** -- all numeric computation
- **No GPU required** -- everything runs on CPU
- **No external services** -- fully self-contained, works offline

### MiDaS Small Model

Download the ONNX model (~17MB):

```bash
wget https://github.com/isl-org/MiDaS/releases/download/v3_1/midas_v21_small_256.onnx \
  -O services/vehicle-runtime/models/midas_small.onnx
```

This model takes a 256x256 RGB input and outputs a 256x256 relative depth
map at ~10-15 FPS on Intel Atom.

## USB Camera Setup

The car always drives forward -- when returning home it turns around first,
then drives back.  There is no need for a rear-facing camera.  The extra
USB camera is mounted **forward-facing beside the built-in camera** to
form a stereo pair.

### Why Stereo Beats Mono

| | Mono (MiDaS only) | Stereo (2 cameras) |
| --- | --- | --- |
| Distance type | Relative (0-1 scale, no units) | Metric (real cm/m via baseline) |
| Obstacle thresholds | Tuned by trial and error | Set in real-world units |
| CPU cost | ~10 FPS (ONNX inference) | ~15 FPS (OpenCV StereoSGBM, lighter) |
| Hardware | Built-in camera only | Built-in + USB camera |
| Accuracy at range | Degrades past ~2m | Good to ~3-4m with 10cm baseline |

### Mounting

Mount the USB camera **8-12 cm** to the left or right of the built-in
camera.  Both cameras must face forward at the same height with parallel
optical axes.

```text
    [USB cam]----10cm----[Built-in cam]
         \                    /
          \                  /
           \   overlapping  /
            \   FOV zone   /
             \            /
              \          /
               ----------
```

No calibration is required for Phase 1 -- OpenCV StereoSGBM is tolerant
of small alignment errors at the short ranges we care about (0.5-3m).
For better accuracy in Phase 3, run a checkerboard stereo calibration.

### Fallback

If no USB camera is plugged in, the system falls back to MiDaS monocular
depth automatically.  Everything still works, just with relative rather
than metric depth estimates.

## File Structure

```text
services/vehicle-runtime/
  vehicle_runtime/
    explorer/
      __init__.py
      obstacle_detector.py    -- MiDaS depth + sector classification
      visual_odometry.py      -- ORB feature tracking + pose estimation
      landmark_db.py          -- Visual landmark storage + matching
      breadcrumb_trail.py     -- Position trail for return-to-home
      navigation_planner.py   -- Explore / Return / Safety logic
      explorer_runtime.py     -- Main loop: camera -> plan -> actuate
      config.py               -- Explorer-specific configuration
    models/
      midas_small.onnx        -- Monocular depth model
```
