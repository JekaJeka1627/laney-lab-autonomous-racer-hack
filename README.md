# Autonomous Deep Racer

**A gamified 3D training environment where humans teach an AI to race.**

Students drive a virtual car in a browser-based simulator. Every lap generates training data — camera frames, steering angles, speed. That data trains a shared neural network that learns to drive autonomously. The class watches the AI improve over time as more people drive.

> Built for Deep Learning 1 at Laney College. No coding experience required to contribute — just drive.

---

## Vision

The virtual training environment is **gamified, 3D, and multiplayer**:

- **3D Racing View** — Chase cam or cockpit cam, real-time driving with keyboard/gamepad/touch
- **2D Top-Down View** — Minimap showing full track layout, car position, racing line trace, and AI ghost car
- **Multiple Tracks** — Oval (beginner), S-curves, city circuit, obstacle course, night mode
- **Dashboard** — Personal stats, class leaderboard, model performance over time, training status
- **Gamification** — XP per lap, achievements/badges, daily challenges, ghost racing vs the AI
- **Data Pipeline** — Every lap feeds the ML training loop automatically

The goal: make data collection feel like playing a game, not doing homework.

---

## How It Works

```
Drive the car  →  Data captured  →  Model trains  →  AI drives  →  Measure improvement
     ↑                                                                       |
     └─────────────────────── drive more to improve ←──────────────────────────────┘
```

1. **You drive** the car manually in the simulator
2. **Frames + controls** are recorded as training data
3. **A model trains** on accumulated data from the whole class
4. **The AI drives** autonomously — you can watch or race against it
5. **Metrics improve** as the dataset grows: faster laps, fewer crashes, smoother steering

---

## What You'll Learn

| Concept | How You Experience It |
|---------|----------------------|
| **Supervised Learning** | Your driving demonstrations become labeled training data |
| **Neural Networks** | The model learns steering from camera images |
| **Dataset Construction** | The class collectively builds the dataset by driving |
| **Train / Evaluate / Iterate** | Watch the model improve with each training cycle |
| **Overfitting & Generalization** | See how the model handles tracks it wasn't trained on |
| **Sim-to-Real Transfer** | Models trained here deploy to a physical DeepRacer vehicle |

---

## For All Experience Levels

- **No coding experience** — Drive the simulator, review dashboards, give feedback. Your laps are just as valuable as anyone else's.
- **Some experience** — Help with data pipelines, reward functions, testing and evaluation.
- **Advanced** — Model architecture, training infrastructure, sim-to-real deployment, obstacle detection.

---

## Architecture

### This Repo (Monorepo)

```
laney-lab-autonomous-racer-hack/
  README.md
  docs/                          # Project specifications
  simulator/                     # Browser-based 3D/2D driving UI (Next.js + Three.js)
  services/
    api/                         # FastAPI — runs, models, training, metrics, tracks
    trainer/                     # Model training worker (PyTorch)
    metrics/                     # Per-run and aggregate metrics computation
    dashboard/                   # Analytics dashboard (Streamlit or integrated)
  sim/
    tracks/                      # Track definitions (YAML)
  infra/
    docker-compose.yml           # Local dev stack
    env.example                  # Environment variable template
  upstream/                      # Git submodules (pinned upstream forks)
    deepracer-for-cloud/
    deepracer-simapp/
    aws-deepracer/
```

### Related Repos

| Repo | Purpose | Phase |
|------|---------|-------|
| **laney-lab-autonomous-racer-hack** | Simulator, API, training, dashboard (this repo) | Now |
| **laney-deepracer-for-cloud** | Fork of [DRfC](https://github.com/aws-deepracer-community/deepracer-for-cloud) — sim runtime | Soon |
| **laney-deepracer-simapp** | Fork of [SimApp](https://github.com/aws-deepracer-community/deepracer-simapp) — sim internals | Soon |
| **laney-aws-deepracer-device** | Fork of [vehicle SW](https://github.com/aws-deepracer/aws-deepracer-device-software) — physical car | Later |

Upstream forks are integrated via git submodules in `upstream/`.

---

## Simulator Features (Planned)

### 3D Racing View
- React Three Fiber (Three.js) in the browser
- Chase cam / cockpit cam toggle
- Real-time steering via keyboard, gamepad, or touch
- Speed gauge, lap timer, racing line overlay
- Camera frame capture at ~10–15 FPS for training data

### 2D Top-Down Minimap
- Always-visible canvas overlay
- Full track layout with car position + heading
- Racing line trace (where you've driven)
- Ghost car showing the AI model's last autonomous run

### Tracks

| Track | Difficulty | Description |
|-------|-----------|-------------|
| Oval | Beginner | Simple loop — learn the controls |
| S-Curves | Intermediate | Tests smooth steering transitions |
| City Circuit | Advanced | Tight turns, intersections |
| Obstacle Course | Advanced | Cones and barriers to avoid |
| Night Mode | Special | Reduced visibility, headlights only |

### Dashboard
- **Personal stats** — laps completed, distance, best lap time, data contributed
- **Class leaderboard** — most laps, cleanest driving, fastest lap
- **Model performance** — completion rate, avg lap time, collision rate over time
- **Training status** — current model version, queue, next training ETA

### Gamification
- **XP system** — earn XP per lap, bonus for clean laps, streak bonuses
- **Achievements** — First Lap, Data Machine (50 laps), Ghost Racer (beat the AI), Night Owl
- **Daily challenges** — "Drive 5 laps on Track 3", "Complete a lap under 30s"
- **Ghost racing** — race against the current AI model or classmates' best laps
- **Track unlocks** — start with Oval, unlock harder tracks as class data grows

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D Engine | React Three Fiber (Three.js) |
| 2D Minimap | HTML Canvas overlay |
| Frontend | Next.js + React + Tailwind CSS |
| Input | Keyboard + Gamepad API + Touch |
| Data Capture | RequestAnimationFrame → frame buffer + control log |
| API | FastAPI (Python) |
| Training | PyTorch |
| Model Export | PyTorch → ONNX → OpenVINO (optional) |
| Storage | Local filesystem or S3-compatible (MinIO) |
| Dashboard | Streamlit or integrated React |
| Deployment | Docker Compose (local), Railway/cloud (production) |

---

## API Contracts (Summary)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs` | POST | Create a new run (manual or autonomous) |
| `/api/runs/{id}` | GET | Get run details + metrics |
| `/api/runs/{id}/upload` | POST | Upload frames + controls for a run |
| `/api/models` | GET | List model versions |
| `/api/models/{version}` | GET | Get model details + download artifact |
| `/api/training/jobs` | POST | Queue a training job |
| `/api/training/jobs/{id}` | GET | Check training job status |
| `/api/tracks` | GET | List available tracks |
| `/api/metrics/aggregate` | GET | Model performance over time |

See [API & Contracts Spec](docs/api-and-contracts-spec.md) for full details.

---

## Project Docs

| Document | Description |
|----------|-------------|
| [Welcome Guide](docs/welcome-guide.md) | Start here — project overview for all experience levels |
| [Product Requirements (PRD)](docs/product-requirements.md) | Full product spec: simulator, model system, tracks, metrics |
| [API & Contracts Spec](docs/api-and-contracts-spec.md) | Canonical interfaces for runs, models, training, metrics |
| [Deployment & Hardware Spec](docs/deployment-and-hardware-spec.md) | Physical vehicle target, onboard hardware, sim-to-real parity |
| [Repo Structure & Dev Setup](docs/repo-structure-and-dev-setup.md) | Monorepo layout, Docker compose, local dev setup |
| [Software Links](docs/software-links.md) | Upstream repos we fork/reference |
| [Learning Outcomes](docs/learning-outcomes.md) | What students learn and can claim on resumes |

---

## Project Management

Managed via [ProjectMap](https://project-map.up.railway.app) with AI-powered task routing and Pulse assistant.

**Join the team:** [https://project-map.up.railway.app/join/c70a8e92-e4d1-4a96-a6ff-10761b5f5a72](https://project-map.up.railway.app/join/c70a8e92-e4d1-4a96-a6ff-10761b5f5a72)

---

## Getting Started

1. **Join the project** via the link above
2. **Read the [Welcome Guide](docs/welcome-guide.md)**
3. **Check your tasks** on the Kanban board in ProjectMap
4. **Clone this repo** and follow the [Dev Setup](docs/repo-structure-and-dev-setup.md)
5. **Start driving!** Every lap counts.

---

## Development Milestones

| Milestone | Description | Status |
|-----------|-------------|--------|
| M0 | Docs + repo structure | Done |
| M1 | 3D simulator with manual driving + data capture | In Progress |
| M2 | Training pipeline: data → model → autonomous run | Planned |
| M3 | Dashboard + metrics + leaderboard | Planned |
| M4 | Gamification: XP, achievements, ghost racing | Planned |
| M5 | Multi-track support + track unlocks | Planned |
| M6 | Sim-to-real: deploy model to physical DeepRacer | Future |

---

*Autonomous Deep Racer — Laney College, Spring 2026*
