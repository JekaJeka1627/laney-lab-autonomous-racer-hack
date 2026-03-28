# Deep Racer Simulator

Next.js + React Three Fiber simulator for collecting run data and syncing all completed runs to shared backend storage for team-wide stats and training.

## What Works

- Manual driving with keyboard or touch controls, plus demo AI driving mode
- Chase-camera 3D simulator + HUD + minimap
- Telemetry capture (`steering`, `throttle`, `speed`, position) to local browser storage
- Forward-facing AI camera capture (`160x120`) at ~10 FPS
- AI camera PIP preview (top-right, toggleable)
- Run export as `.zip` (`frames/`, `controls.csv`, `run.json`)
- Dashboard exports for individual runs and all captured runs
- Server-side run ingestion endpoints (`/api/runs`, `/api/stats`)
- Shared training jobs using persisted run IDs snapshot (`/api/train/jobs`)

## Local Setup

### Requirements
- Node.js `>=20.9.0`

### Install

```bash
npm install
```

### Run (dev)

```bash
npm run dev
```

Open `http://localhost:3000`.

### Optional environment variables

- `SIMULATOR_DB_PATH` (default: `.data/simulator.db`): SQLite file path for shared backend data.
- `SIMULATOR_DATA_DIR` (default: `.data`): base directory used when `SIMULATOR_DB_PATH` is not set.
- `NEXT_PUBLIC_API_URL` (optional): explicit API base URL. If omitted, browser clients use same-origin (`window.location.origin`).

### Build / checks

```bash
npm run lint
npm run build
```

## Controls

- `Arrow keys` or `WASD`: drive/steer
- `Space`: brake (manual) / pause-resume (AI mode)
- `Esc`: pause/resume (manual mode)
- `1-5`: snap throttle target presets
- Touch devices: on-screen left/right steering, gas, brake, pause, restart, and end-run controls
- Phones/tablets: landscape orientation is recommended

## Camera Capture + Export Workflow

1. Start a manual run (or demo AI run)
2. Drive laps while the AI camera preview records frames
3. End the run (`Run Complete` screen)
4. The simulator saves image frames to IndexedDB and telemetry metadata to localStorage cache
5. Click `Download Run (.zip)` to export a training-ready bundle
6. The run is queued and synced to shared backend endpoints (`POST /api/runs`, upload artifacts, `POST /api/runs/{id}/finalize`)

Zip contents:
- `frames/*.jpg` (numbered 160x120 JPEGs)
- `controls.csv` (`frame_idx,timestamp_ms,steering,throttle,speed`)
- `run.json` (track/run metadata)

## Dashboard

Visit `http://localhost:3000/dashboard` to:
- review local runs and shared cloud runs
- export JSON/CSV telemetry summaries
- export per-run camera captures
- export `All Runs .zip` for every run with saved image frames
- start shared training jobs based on server-persisted run datasets

## Storage Notes

- Source of truth for global counts and training datasets is backend SQLite (`.data/simulator.db` by default).
- Browser `localStorage` + IndexedDB remain as local capture cache and offline retry queue.
- Clearing browser site data removes local cache only; server-persisted runs remain available to other users.

## API Contract Summary

### `POST /api/runs`

Request:

```json
{
  "user_id": "driver-abc123",
  "track_id": "oval",
  "mode": "manual",
  "local_run_id": "local-run-id"
}
```

Response:

```json
{
  "run_id": "9f0b...",
  "upload_urls": {
    "frames": "http://localhost:3000/api/runs/9f0b.../frames",
    "controls": "http://localhost:3000/api/runs/9f0b.../controls"
  }
}
```

### `GET /api/runs?limit=20&status=completed`

Response:

```json
{
  "items": [{ "run_id": "9f0b...", "user_id": "driver-abc123", "lap_count": 2 }],
  "next_cursor": null
}
```

### `GET /api/stats`

Response:

```json
{
  "completed_runs": 42,
  "completed_laps": 88,
  "completed_frames": 19950,
  "total_duration_s": 5321.2,
  "best_lap_ms": 5123
}
```

### `POST /api/train/jobs`

Request:

```json
{
  "dataset": { "manual_only": true },
  "hyperparams": { "epochs": 3 },
  "export": { "set_active": true }
}
```

Response:

```json
{
  "job_id": "2c19...",
  "status": "succeeded"
}
```

Training job records include `outputs.selected_run_ids` so you can audit exactly which runs were used.

## Validation: Multi-User Aggregation + Training Inclusion

Run this against local or deployed app:

```bash
npm run verify:shared-flow -- http://localhost:3000
```

The script:
1. creates and finalizes one run for user A
2. creates and finalizes one run for user B
3. verifies `/api/stats` global counters increase
4. starts a training job and verifies both new `run_id`s are included in `outputs.selected_run_ids`

## Railway Deployment Notes

- Persist `.data` across deploys by attaching a Railway volume and setting:
  - `SIMULATOR_DATA_DIR=/data`
  - or `SIMULATOR_DB_PATH=/data/simulator.db`
- If you deploy frontend and API on the same service, leave `NEXT_PUBLIC_API_URL` unset so the client uses same-origin.
- If API is separate, set `NEXT_PUBLIC_API_URL` to that service base URL.
- No manual migration command is required. Schema and indexes are auto-created on first API request.
