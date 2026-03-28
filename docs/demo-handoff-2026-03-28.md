# Demo Handoff - March 28, 2026

This note is for the Saturday morning DeepRacer demo so a fresh Codex session can resume quickly without re-discovering the current state.

## Goal

Get the physical DeepRacer to perform a conservative, controlled on-track demo using the current custom runtime and the `sdc-navigator` model.

## Repo

- Local repo: `C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack`

## DeepRacer Network Info

As of Friday night, March 27, 2026:

- DeepRacer hostname: `amss-4dcj`
- DeepRacer SSH target: `deepracer@192.168.68.109`
- Custom runtime URL: `http://192.168.68.109:8110`

Notes:

- The car previously appeared at `192.168.68.108` on March 26, 2026.
- On March 27, 2026 it responded at `192.168.68.109`.
- If SSH host key issues appear, clear stale keys with:

```powershell
ssh-keygen -R 192.168.68.109
ssh deepracer@192.168.68.109
```

## What Was Verified Friday Night

- SSH works to `deepracer@192.168.68.109`.
- `deepracer-core` is running on the car.
- A custom `uvicorn` vehicle runtime is listening on port `8110`.
- The runtime is now running with:
  - `VEHICLE_CAMERA_BACKEND=deepracer_snapshot`
  - `VEHICLE_ACTUATOR_BACKEND=deepracer`
  - `VEHICLE_BATTERY_BACKEND=deepracer`
  - `VEHICLE_DEFAULT_THROTTLE=0.30`
  - `VEHICLE_MAX_THROTTLE=0.30`
- The runtime health endpoint responds.
- The runtime status endpoint reports:
  - `loaded_model_version = "sdc-navigator@stock"`
  - `last_error = null`
- `GET /camera/latest.jpg` returns a real camera image from the car.

## Important Discovery

The main issue Friday night was not missing code in the repo. The issue was runtime drift between:

- the laptop repo
- the deployed files on the DeepRacer
- the actual live `uvicorn` process on port `8110`

The local repo and the car contained `.pb` DeepRacer track models, but the runtime path initially assumed ONNX-only behavior in the wrong place. That mismatch was repaired enough to get the runtime back into a loaded, no-error state.

## Model Choice for Demo

Use `sdc-navigator` as the baseline demo model.

Reason:

- It is the safest current candidate for a physical track demo.
- It is already the loaded model in the live runtime.
- Avoid switching models Saturday morning unless this model clearly fails.

Do not spend demo morning experimenting with multiple models unless absolutely necessary.

## Battery Caveat

Battery telemetry is not trustworthy yet.

Observed Friday night:

- Stock battery API responded with `battery_level: -1`
- Runtime battery fields were still `null` / `unknown`

Treat battery readiness as a manual operational check, not a software-trusted check.

## Recommended Saturday Morning Procedure

### 1. Verify connectivity

From laptop:

```powershell
ssh deepracer@192.168.68.109
```

Check runtime:

```powershell
curl http://192.168.68.109:8110/health
curl http://192.168.68.109:8110/status
```

Expected:

- health returns `{"status":"ok","service":"vehicle-runtime"}`
- status shows `loaded_model_version` for `sdc-navigator`
- status shows `last_error: null`

### 2. Verify camera

```powershell
curl http://192.168.68.109:8110/camera/latest.jpg --output latest.jpg
```

Confirm the image is current and usable.

### 3. Lifted-wheel hardware check before putting the car down

Run with the car lifted off the ground:

```powershell
curl -X POST http://192.168.68.109:8110/control/manual-override ^
  -H "Content-Type: application/json" ^
  -d "{\"steering\":-0.5,\"throttle\":0.0,\"duration_ms\":800}"

curl -X POST http://192.168.68.109:8110/control/manual-override ^
  -H "Content-Type: application/json" ^
  -d "{\"steering\":0.5,\"throttle\":0.0,\"duration_ms\":800}"

curl -X POST http://192.168.68.109:8110/control/manual-override ^
  -H "Content-Type: application/json" ^
  -d "{\"steering\":0.0,\"throttle\":0.15,\"duration_ms\":500}"

curl -X POST http://192.168.68.109:8110/control/estop
curl -X POST http://192.168.68.109:8110/control/release-estop
```

Check:

- steering left works
- steering right works
- throttle pulse works
- estop works

### 4. First floor run

Do a short, conservative shakedown run first.

Start learned control:

```powershell
curl -X POST http://192.168.68.109:8110/control/start
curl http://192.168.68.109:8110/status
```

Stop immediately if needed:

```powershell
curl -X POST http://192.168.68.109:8110/control/estop
curl -X POST http://192.168.68.109:8110/control/stop
```

### 5. Demo posture

- Treat the first on-track attempt as a shakedown, not the public run.
- Keep one person dedicated to estop / laptop control.
- Bias toward wider turns and a forgiving track shape.
- Do not trust battery telemetry.
- Do not change multiple things at once under pressure.

## Throttle Guidance

For the Saturday demo, learned throttle is not required.

What matters is that fixed throttle is conservative enough for the actual track.

Current runtime values on the car:

- `VEHICLE_DEFAULT_THROTTLE=0.30`
- `VEHICLE_MAX_THROTTLE=0.30`

If the car is twitchy or overshoots corners on the first floor test, reduce throttle before changing anything else.

## Local Repo Changes Made Friday Night

The local repo was patched so future work tracks the reality of DeepRacer `.pb` models better.

Key files updated:

- [services/vehicle-runtime/vehicle_runtime/local_model_loader.py](C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\services\vehicle-runtime\vehicle_runtime\local_model_loader.py)
- [services/vehicle-runtime/vehicle_runtime/predictor.py](C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\services\vehicle-runtime\vehicle_runtime\predictor.py)
- [services/vehicle-runtime/vehicle_runtime/runtime.py](C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\services\vehicle-runtime\vehicle_runtime\runtime.py)
- [services/vehicle-runtime/vehicle_runtime/explorer/track_model_adapter.py](C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\services\vehicle-runtime\vehicle_runtime\explorer\track_model_adapter.py)
- [services/vehicle-runtime/tests/test_runtime.py](C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\services\vehicle-runtime\tests\test_runtime.py)
- [services/vehicle-runtime/tests/test_local_model_loader.py](C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack\services\vehicle-runtime\tests\test_local_model_loader.py)

Local verification run:

```powershell
$env:PYTHONPATH='services/vehicle-runtime'
pytest -q services/vehicle-runtime/tests/test_local_model_loader.py services/vehicle-runtime/tests/test_runtime.py
```

Result Friday night:

- `7 passed`

## Important Warning About Deployment

The live runtime on the car is not guaranteed to exactly match the laptop repo at any given moment. Friday night involved repairing the live car runtime directly enough to restore a loaded model and working camera path.

If a new morning session decides to redeploy, it must:

- inspect the exact files and Python version on the car first
- not assume the car is running the exact same code revision as the laptop repo
- verify `python3 --version` on the car before copying repo files blindly

Friday night the car reported:

- `Python 3.8.5`

That matters because some newer Python features or assumptions from the laptop environment can break the live runtime.

## Best Prompt To Give Codex Saturday Morning

Use something like:

> We are working in `C:\Users\jesse\CascadeProjects\laney-lab-autonomous-racer-hack`. Read `docs/demo-handoff-2026-03-28.md` first. We need to continue the physical DeepRacer demo bring-up for this morning. Verify the car at `deepracer@192.168.68.109`, confirm runtime health at `http://192.168.68.109:8110`, and help us perform a conservative pre-demo shakedown without changing models unless necessary.

