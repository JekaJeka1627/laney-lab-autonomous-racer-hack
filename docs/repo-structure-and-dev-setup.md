Repo Structure & Dev Setup

Virtual LfD Simulator + Model Training + Dashboards + Deployable Vehicle Target



1. Purpose

This document defines:

the recommended monorepo structure for the project,

how forked upstream DeepRacer repos fit in,

local development setup (single-machine),

optional “lab server” setup (multi-user),

Docker-compose orchestration and service boundaries.

This is designed to be buildable by an AI coding model with minimal ambiguity.



2. Repositories and Fork Strategy

We will maintain:

2.1 Our Canonical Repo (monorepo)

laney-autonomous-racer (this repo)

Contains:

API + contracts implementation

simulator UI / control layer

run storage + metrics

training pipeline + model registry

dashboards

deployment tooling (model packaging, push-to-vehicle)

2.2 Forked Upstream Repos (vendored into /upstream/)

We fork and adapt these as needed:

deepracer-for-cloud (simulation/training baseline)

deepracer-simapp (sim internals, tracks, “markov” wiring)

aws-deepracer/* (vehicle runtime packages)

We keep upstream forks as separate repos for clean merging, then integrate them into the monorepo via one of:

git submodules (recommended), or

subtree merges, or

pinned vendored copies.

Recommendation: use submodules with pinned commits.



3. Monorepo Layout (Recommended)

laney-autonomous-racer/

 README.md

 docs/

   product-requirements.md

   api-and-contracts-spec.md

   deployment-and-hardware-spec.md

   repo-structure-and-dev-setup.md

   software-links.md



 upstream/                      # git submodules (pinned commits)

   deepracer-for-cloud/

   deepracer-simapp/

   aws-deepracer/               # optional umbrella or selected pkgs



 services/

   api/                         # FastAPI (Runs, Models, Training, Metrics, Tracks)

     app/

     tests/

     Dockerfile

     pyproject.toml



   trainer/                     # training worker (PyTorch + exports)

     trainer/

     Dockerfile

     pyproject.toml



   metrics/                     # metrics worker (run scoring, aggregation)

     metrics/

     Dockerfile

     pyproject.toml



   dashboard/                   # Streamlit dashboards

     dashboard/

     Dockerfile

     requirements.txt



 sim/

   client/                      # student-facing simulator UI + controls

     src/

     assets/

     README.md



   adapter/                     # bridge from sim runtime to API contracts

     sim_adapter/

     pyproject.toml



   tracks/                      # canonical track configs we own (track_id -> config)

     track_a.yaml

     track_b.yaml

     README.md



 model_registry/

   artifacts/                   # local dev storage (gitignored) OR empty placeholder

   README.md



 storage/

   runs/                        # local dev storage (gitignored)

   datasets/                    # derived datasets (gitignored)

   metrics/                     # computed metrics (gitignored)



 infra/

   docker-compose.yml

   env.example

   scripts/

     bootstrap.sh

     dev_up.sh

     dev_down.sh

     seed_tracks.sh

     seed_users.sh



 vehicle/

   runtime/                     # vehicle-side runtime adapter (later)

   deploy/                      # model packaging + push scripts

   README.md

Notes:

storage/ is for local dev only. In shared environments, use S3-compatible storage.

upstream/ is where forks live; our code never “hides” inside upstream repos.



4. Service Boundaries

4.1 API Service (FastAPI)

Responsibilities:

Runs CRUD + artifact upload coordination

Model registry CRUD

Track list + configs

Training jobs queueing/status

Metrics retrieval + aggregate queries

“Active model version” selection

4.2 Trainer Worker

Responsibilities:

Build dataset snapshots from Runs

Train models (PyTorch)

Export artifacts (PyTorch → ONNX → OpenVINO optional)

Register model version in API/registry

4.3 Metrics Worker

Responsibilities:

Compute per-run metrics (completion, off-track, stability)

Store metrics linked to run/model/track/time

Produce aggregate time series

4.4 Dashboard Service (Streamlit)

Responsibilities:

Read-only views via API

Model timeline + performance over time

Per-track comparisons

Run inspection (links to artifacts)

4.5 Simulator Client + Adapter

Responsibilities:

Manual drive UI

“Run model” autonomous UI

Local sim runtime loop

Adapter calls to API contracts for Run creation, uploads, finalization



5. Local Development Setup (Single Machine)

5.1 Requirements

Docker Desktop

Python 3.10+ (for local dev outside containers)

Git

(Optional) NVIDIA not required

5.2 Environment Variables

Create .env from infra/env.example. Minimum:

API_BASE_URL=http://api:8000 (docker network)

STORAGE_MODE=local|s3

LOCAL_STORAGE_ROOT=/data

DATABASE_URL=sqlite:////data/app.db

If S3-compatible:

S3_ENDPOINT_URL=...

S3_ACCESS_KEY=...

S3_SECRET_KEY=...

S3_BUCKET_RUNS=...

S3_BUCKET_MODELS=...

S3_BUCKET_METRICS=...

5.3 Bring Up Dev Stack

From repo root:

docker compose -f infra/docker-compose.yml up --build

Expected services:

api at http://localhost:8000

dashboard at http://localhost:8501

Trainer/metrics workers may run as:

always-on workers, or

job-triggered containers.



6. Docker Compose (Recommended Topology)

Compose should define:

api

trainer

metrics

dashboard

storage volume mount (local mode)

optional minio (S3-compatible local) + mc init container

Storage recommendation for local dev:

Use minio to match production patterns, even locally.



7. Upstream Fork Integration Plan

7.1 deepracer-for-cloud

Used to bootstrap simulation/training realism quickly.

Integration approach:

keep upstream as reference and/or runtime container source

implement our sim adapter that:

captures frames + controls

runs model inference for autonomous mode

emits run artifacts into our Run contracts

We do not require students to operate raw DRfC tooling directly; our UI sits above it.

7.2 deepracer-simapp

Used for:

track definitions

sim plumbing

deeper hook points

We may borrow:

track assets or definitions

sim behavior configuration

7.3 aws-deepracer repos

Used for physical deployment target.

Integration approach:

create vehicle/runtime adapter implementing:

camera ingestion → preprocessing → inference

safe control loop

telemetry reporting (battery/faults/model version)

create vehicle/deploy scripts to push model artifacts by version



8. Track Format (Canonical)

Tracks live in sim/tracks/*.yaml.

Minimal schema:

track_id

name

spawn_pose

boundaries

waypoints or centerline

evaluation_zones (optional)

sim_params (camera resolution, FOV, friction, etc.)

The API exposes tracks via:

GET /api/tracks

GET /api/tracks/{track_id}



9. Artifact Storage Conventions

9.1 Runs

Each run stores:

frames/ (binary)

controls.jsonl

run.mp4 (optional)

metrics.json (optional)

Suggested object key scheme:

runs/{track_id}/{date}/{run_id}/...

9.2 Models

models/{model_version}/pytorch.pt

models/{model_version}/model.onnx

models/{model_version}/openvino/

9.3 Metrics

metrics/runs/{run_id}.json

aggregates computed via DB queries or materialized snapshots



10. Development Workflow (Practical)

10.1 First Milestone (Minimum viable loop)

Manual drive produces a Run (frames + controls)

Training job builds model version v0001

Autonomous run executes v0001

Metrics computed for that run

Dashboard shows v0001 exists and has metrics

10.2 CI Suggestions (optional)

lint + format

unit tests for schema validation

contract tests for API endpoints



11. Recommended Naming (Forks + Repo)

Canonical: laney-autonomous-racer

Forks:

laney-deepracer-for-cloud

laney-deepracer-simapp

laney-aws-deepracer-* (only for packages we modify)



