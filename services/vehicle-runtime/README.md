# Vehicle Runtime Service

Physical racer runtime for camera -> model inference -> actuator control.

## What it does (v1)

- Auto-discovers ONNX models from the local `.active-model/` directory (zero config)
- Falls back to the shared API if no local model is found
- Captures frames from a camera source (OpenCV or mock)
- Runs ONNX inference (steering output in `[-1, 1]`)
- Applies safety bounds / emergency stop behavior
- Supports API-triggered manual override (operator takeover) with timeout
- Sends bounded steering + throttle commands to an actuator adapter
- Records local autonomous session artifacts (`frames.zip`, `controls.csv`, `run.json`)
- Optionally uploads recorded sessions to the shared Runs API
- Auto-reloads when the model switcher deploys a new model
- Exposes status/control endpoints over FastAPI

## Current scope

- Real ONNX inference path is implemented
- Local model auto-discovery and hot-reload implemented
- Hardware interfaces are adapter-based with mock implementations included
- Obstacle sensing, battery telemetry, and return-to-base are not implemented yet

## Model Loading (zero config)

The runtime automatically finds and loads models. No env vars or API needed for basic operation.

### How it works

1. **Local first:** Checks `.active-model/` for an `.onnx` file. If found, loads it immediately.
2. **Auto-reload:** When the model switcher deploys a new model, the runtime detects the change and reloads automatically.
3. **API fallback:** If no local model exists, falls back to the shared API (requires `VEHICLE_API_BASE_URL`).
4. **Pinned version:** If `VEHICLE_MODEL_VERSION` is set, uses that specific version from the API.

### Typical workflow

```bash
# From the repo root -- switch the active model
python -m model_registry.cli set-active center-align

# The switcher:
#   1. Copies model files to services/vehicle-runtime/.active-model/
#   2. Writes active_model_marker.json with timestamp
#   3. Pokes the runtime's /model/reload endpoint (if running)
#
# The runtime:
#   1. Detects the new marker timestamp
#   2. Finds the .onnx file in .active-model/
#   3. Loads it automatically
#   4. Starts using the new model on the next inference tick
```

No restart needed. No env vars to set. Just `set-active` and drive.

### Manual model loading (no registry)

You can also just drop an `.onnx` file into `.active-model/` directly:

```bash
cp my-model.onnx services/vehicle-runtime/.active-model/
# Runtime will find it on the next refresh cycle (default: 30 seconds)
# Or trigger immediate reload:
curl -X POST http://localhost:8100/model/reload
```

## Quick start (mock mode)

```bash
python -m pip install -r requirements.txt
uvicorn vehicle_runtime.main:app --reload --port 8100
```

Optional env vars:

- `VEHICLE_LOCAL_MODEL_DIR=.active-model` (path to local model directory, default works with switcher)
- `VEHICLE_API_BASE_URL` (e.g. `https://shared-runs-api-production.up.railway.app`)
- `VEHICLE_MODEL_VERSION` (pins model; otherwise uses active model)
- `VEHICLE_MODEL_REFRESH_SECONDS=30` (how often to check for model changes)
- `VEHICLE_CAMERA_BACKEND=mock|opencv`
- `VEHICLE_ACTUATOR_BACKEND=mock|stdout|serial`
- `VEHICLE_ACTUATOR_SERIAL_PORT=COM7` (Windows) or `/dev/ttyUSB0` (Linux)
- `VEHICLE_ACTUATOR_SERIAL_BAUDRATE=115200`
- `VEHICLE_CAMERA_DEVICE_INDEX=0`
- `VEHICLE_AUTOSTART=false`
- `VEHICLE_DEFAULT_THROTTLE=0.35`
- `VEHICLE_USER_ID=vehicle-runtime`
- `VEHICLE_TRACK_ID=physical-track`
- `VEHICLE_UPLOAD_RUN_ON_STOP=false`

## API endpoints

- `GET /health`
- `GET /status`
- `POST /session/start`
- `POST /session/stop?upload=false`
- `POST /session/upload-latest`
- `POST /control/start`
- `POST /control/stop`
- `POST /control/estop`
- `POST /control/release-estop`
- `POST /control/manual-override`
- `POST /control/manual-override/clear`
- `POST /control/step` (single tick; useful in mock/testing)
- `POST /model/reload`

`/status` now includes:
- battery snapshot (`battery_percent`, `battery_voltage_v`, `battery_state`) via mock monitor by default
- session state (`session_active`, `session_id`, `last_session_artifacts_dir`)
- manual override state (`manual_override_active`, `manual_override_remaining_ms`)

## Deterministic Override Layer

Manual override supersedes learned inference for a bounded duration while still passing through the safety clamps.

```bash
curl -X POST http://localhost:8100/control/manual-override ^
  -H "Content-Type: application/json" ^
  -d "{\"steering\": -0.4, \"throttle\": 0.2, \"duration_ms\": 1500}"
```

- Emergency stop supersedes manual override
- Timeout expiry automatically returns control to learned inference

## Actuator Backends

### `mock`
- Records commands in memory (tests/dev)

### `stdout`
- Prints commands to stdout (debugging)

### `serial` (new)
- Sends newline-delimited JSON to a serial-connected controller (`pyserial`)
- Intended for Arduino/ESP32/RPi bridge firmware

Example payloads sent over serial:

```json
{"type":"control","steering":0.12,"throttle":0.30}
{"type":"stop"}
```

The microcontroller can map normalized values to PWM/servo/ESC outputs:
- `steering`: `[-1, 1]`
- `throttle`: `[0, max_throttle]` after safety clamping

## Hardware Bring-Up Stubs (for classmate work this week)

Use these files to capture hardware details and return later for final adapter completion:

- `services/vehicle-runtime/HARDWARE_HANDOFF_CHECKLIST.md`
- `services/vehicle-runtime/hardware-profile.stub.json`
- `services/vehicle-runtime/SERIAL_BRIDGE_PROTOCOL.md`

Recommended workflow:
1. Fill `hardware-profile.stub.json` with actual steering/throttle/watchdog values
2. Record test results in `HARDWARE_HANDOFF_CHECKLIST.md`
3. Keep controller firmware aligned with `SERIAL_BRIDGE_PROTOCOL.md`
4. Then we implement the exact hardware adapter mapping in `vehicle-runtime`

## Shared API run upload (physical session traces)

If `VEHICLE_API_BASE_URL` is configured, you can upload recorded sessions to the shared API.

1. Start a session: `POST /session/start` (or start the control loop; it auto-starts a session)
2. Run control loop / step commands
3. Stop session and upload in one call:
   - `POST /session/stop?upload=true`

The runtime uploads:
- `frames.zip` -> `/api/runs/{id}/frames`
- `controls.csv` -> `/api/runs/{id}/controls`
- finalize metadata -> `/api/runs/{id}/finalize`
