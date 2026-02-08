API & Contracts Specification

Virtual LfD Simulator + Deployable Vehicle Runtime



1. Purpose

This document defines the canonical interfaces for:

simulator run logging (manual + autonomous),

model registry and artifact loading,

training job execution,

evaluation metrics emission,

dashboards and analytics queries,

deployment hooks for a physical vehicle runtime.

These contracts are designed to be implemented in a “Laney-owned” repo and integrated into forked upstream components (DeepRacer sim/training + vehicle software).



2. System Components (Logical)

Simulator Runtime

manual drive mode

autonomous run mode

Run Store

immutable run records + artifacts

Training Service

builds dataset snapshots

trains model versions

Model Registry

stores versioned model artifacts + metadata

Metrics Service

computes and stores per-run + aggregate metrics

Dashboard

reads Runs/Models/Metrics for visualization

Vehicle Runtime (deployment target)

camera → inference → control loop

telemetry reporting



3. Canonical Data Types

3.1 Identifiers

RunId: string (UUID recommended)

ModelId: string (UUID recommended)

ModelVersion: string (e.g., v0007 or semver)

TrackId: string (slug)

UserId: string (auth subject or provided handle)



4. Core Schemas

4.1 Run (Canonical)

Run is immutable once created. A run may have associated binary artifacts (frames, video, tensors).

{

 "run_id": "uuid",

 "user_id": "string",

 "track_id": "string",

 "mode": "manual|autonomous",

 "model_version": "v0007|null",

 "started_at": "2026-02-06T12:34:56Z",

 "ended_at": "2026-02-06T12:40:12Z",

 "duration_s": 316.0,

 "frame_count": 9480,

 "sim_build": "string",

 "client_build": "string",

 "notes": "string|null",

 "artifacts": {

   "frames_uri": "uri-or-path",

   "run_video_uri": "uri-or-path|null",

   "controls_uri": "uri-or-path",

   "metrics_uri": "uri-or-path|null"

 }

}

Required artifact payloads

Frames stream (one per timestep):

timestamp_ms

rgb_frame (stored binary; indexed)

Controls stream (one per timestep):

timestamp_ms

steering (float, normalized [-1, 1])

throttle (float, optional [-1, 1] or [0,1]—pick one and lock)

is_human_override (bool, optional)



4.2 Model (Registry Record)

{

 "model_id": "uuid",

 "model_version": "v0007",

 "created_at": "2026-02-06T20:01:00Z",

 "status": "training|ready|failed|archived",

 "architecture": {

   "type": "cnn_regression",

   "input": { "width": 160, "height": 120, "channels": 3 },

   "output": { "steering": "float[-1,1]" },

   "notes": "string|null"

 },

 "training": {

   "dataset_id": "uuid",

   "run_ids": ["uuid", "uuid"],

   "frames_total": 1234567,

   "hyperparams": {

     "epochs": 10,

     "batch_size": 64,

     "learning_rate": 0.0003

   },

   "metrics": {

     "train_loss": 0.0123,

     "val_loss": 0.0210

   }

 },

 "artifacts": {

   "pytorch_uri": "uri-or-path",

   "onnx_uri": "uri-or-path|null",

   "openvino_uri": "uri-or-path|null"

 }

}



4.3 Metrics (Per-Run)

Metrics are emitted for every autonomous run and optionally for manual runs.

{

 "run_id": "uuid",

 "model_version": "v0007|null",

 "track_id": "string",

 "computed_at": "2026-02-06T12:41:00Z",

 "metrics": {

   "completion": 0.0,

   "off_track_count": 12,

   "off_track_ratio": 0.08,

   "avg_speed_mps": 0.9,

   "steering_stability": 0.72,

   "collision_count": 2,

   "intervention_count": 0

 }

}

Metric definitions (minimum)

completion: float [0,1]

off_track_count: integer

off_track_ratio: float [0,1]

steering_stability: float [0,1] (define algorithm: e.g., 1 - normalized steering jerk)

collision_count: integer (if collisions modeled)

intervention_count: integer (if assisted mode exists later)



5. API Surface (HTTP, JSON)

Base URL: /api

5.1 Runs

Create Run (metadata only)

POST /api/runs

Request:

{

 "user_id": "string",

 "track_id": "string",

 "mode": "manual|autonomous",

 "model_version": "v0007|null",

 "sim_build": "string",

 "client_build": "string"

}

Response:

{ "run_id": "uuid", "upload_urls": { "frames": "...", "controls": "..." } }

Upload Artifacts

Implementation may use:

direct multipart upload to API, or

presigned URLs to object storage.

Contract requirement: the Run is not “complete” until required artifacts are uploaded.

Finalize Run

POST /api/runs/{run_id}/finalize

Response:

{ "status": "complete" }

List Runs (filters)

GET /api/runs?track_id=&mode=&user_id=&model_version=&limit=&cursor=

Get Run

GET /api/runs/{run_id}



5.2 Models

List Models

GET /api/models?status=ready&limit=&cursor=

Get Model

GET /api/models/{model_version}

Set Active Model (for autonomous runs default)

POST /api/models/active Request:

{ "model_version": "v0007" }

Response:

{ "active_model_version": "v0007" }

Get Active Model

GET /api/models/active



5.3 Training Jobs

Start Training Job

POST /api/train/jobs

Request:

{

 "dataset": {

   "track_ids": ["track_a", "track_b"],

   "modes": ["manual"],

   "run_ids": ["uuid", "uuid"],

   "max_frames": 2000000

 },

 "hyperparams": {

   "epochs": 10,

   "batch_size": 64,

   "learning_rate": 0.0003

 },

 "export": {

   "onnx": true,

   "openvino": true

 }

}

Response:

{ "job_id": "uuid", "status": "queued" }

Get Training Job Status

GET /api/train/jobs/{job_id}

Response:

{

 "job_id": "uuid",

 "status": "queued|running|succeeded|failed",

 "progress": { "epoch": 4, "epochs": 10 },

 "outputs": { "model_version": "v0007|null" },

 "logs_uri": "uri-or-path|null"

}



5.4 Metrics

Compute Metrics for Run (optional synchronous trigger)

POST /api/metrics/compute Request:

{ "run_id": "uuid" }

Get Metrics for Run

GET /api/metrics/runs/{run_id}

Aggregate Metrics (for dashboards)

GET /api/metrics/aggregate?track_id=&model_version=&from=&to=

Response:

{

 "series": [

   { "model_version": "v0005", "completion_avg": 0.31, "off_track_ratio_avg": 0.22 },

   { "model_version": "v0006", "completion_avg": 0.44, "off_track_ratio_avg": 0.18 }

 ]

}



5.5 Tracks

List Tracks

GET /api/tracks

Response:

[

 { "track_id": "track_a", "name": "Intro Loop", "config_uri": "..." }

]

Get Track

GET /api/tracks/{track_id}



6. Simulator Integration Contract

The simulator must implement a small adapter layer that calls the API:

Manual drive session

POST /api/runs → get run_id + upload URLs

stream frames + controls to artifact store

POST /api/runs/{run_id}/finalize

Autonomous run session

GET /api/models/active (or user selects a version)

load model artifact (ONNX/OpenVINO preferred)

execute simulation loop (no human input)

log run artifacts

finalize run

metrics compute is triggered automatically or via job



7. Dashboard Contract

Dashboards must not parse raw artifacts directly for normal operation. They should rely on API endpoints for:

model timeline (/api/models)

run counts (/api/runs filters)

per-run metrics (/api/metrics/runs/{run_id})

aggregate series (/api/metrics/aggregate)



8. Vehicle Deployment Interfaces (Logical)

The vehicle runtime must expose:

8.1 Model Loader

Load model artifact by model_version

Support ONNX/OpenVINO formats (preferred)

8.2 Control Loop

Input: camera frames (same preprocessing as simulator)

Output: steering/throttle commands with bounded ranges

8.3 Telemetry Reporter

Publish:

battery state

safety state

faults

current model version

run/session logs (optional)

These should map to the same schemas as simulator runs where possible.



9. Integration Points with Forked Upstreams

This system is designed to integrate with forked upstream DeepRacer repos via adapters:

Simulator/Training upstreams (fork + adapt)

Hook points:

capture camera frames + controls during manual drive

run the selected model in autonomous mode

emit off-track/collision signals if available

Vehicle upstreams (fork + adapt)

Hook points:

camera ingestion pipeline

inference node (OpenVINO/ONNX)

actuator command publishing

battery telemetry integration

safety override layer

The canonical contracts remain defined by this spec.



10. Non-Functional Requirements

Runs are immutable and auditable

Model versions are reproducible from dataset snapshots

API supports concurrent users and concurrent run uploads

Storage supports large frame volumes (object storage recommended)

Training jobs can run asynchronously with progress reporting



11. Minimum Implementation (for a usable v1)

A v1 is considered usable when:

users can create manual runs and upload frames/controls

training jobs produce versioned models

users can run the active model autonomously in the simulator

per-run metrics are computed and visible

dashboard shows model versions and performance trends



