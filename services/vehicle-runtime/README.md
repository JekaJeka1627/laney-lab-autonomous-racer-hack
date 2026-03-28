# Vehicle Runtime Service

Physical racer runtime for camera -> model inference -> actuator control.

## What it does (v1)

- Loads the active (or pinned) ONNX model from the shared API
- Captures frames from a camera source (OpenCV or mock)
- Runs ONNX inference (steering output in `[-1, 1]`)
- Applies safety bounds / emergency stop behavior
- Supports API-triggered manual override (operator takeover) with timeout
- Sends bounded steering + throttle commands to an actuator adapter
- Records local autonomous session artifacts (`frames.zip`, `controls.csv`, `run.json`)
- Optionally uploads recorded sessions to the shared Runs API
- Exposes status/control endpoints over FastAPI

## Current scope

- Real ONNX inference path is implemented
- Hardware interfaces are adapter-based with mock implementations included
- Obstacle sensing, battery telemetry, and return-to-base are not implemented yet

## Quick start (mock mode)

```bash
python -m pip install -r requirements.txt
uvicorn vehicle_runtime.main:app --reload --port 8100
```

Optional env vars:

- `VEHICLE_API_BASE_URL` (e.g. `https://shared-runs-api-production.up.railway.app`)
- `VEHICLE_MODEL_VERSION` (pins model; otherwise uses active model)
- `VEHICLE_CAMERA_BACKEND=mock|opencv`
- `VEHICLE_ACTUATOR_BACKEND=mock|stdout|serial|deepracer`
- `VEHICLE_ACTUATOR_SERIAL_PORT=COM7` (Windows) or `/dev/ttyUSB0` (Linux)
- `VEHICLE_ACTUATOR_SERIAL_BAUDRATE=115200`
- `VEHICLE_CAMERA_DEVICE_INDEX=0`
- `VEHICLE_DEEPRACER_GPIO_ENABLE=436`
- `VEHICLE_DEEPRACER_PWM_CHIP=0`
- `VEHICLE_DEEPRACER_THROTTLE_CHANNEL=0`
- `VEHICLE_DEEPRACER_STEERING_CHANNEL=1`
- `VEHICLE_DEEPRACER_THROTTLE_NEUTRAL=1446000`
- `VEHICLE_DEEPRACER_THROTTLE_FORWARD=1554000`
- `VEHICLE_DEEPRACER_THROTTLE_REVERSE=1338000`
- `VEHICLE_DEEPRACER_STEERING_CENTER=1450000`
- `VEHICLE_DEEPRACER_STEERING_LEFT=1290000`
- `VEHICLE_DEEPRACER_STEERING_RIGHT=1710000`
- `VEHICLE_AUTOSTART=false`
- `VEHICLE_DEFAULT_THROTTLE=0.35`
- `VEHICLE_USER_ID=vehicle-runtime`
- `VEHICLE_TRACK_ID=physical-track`
- `VEHICLE_UPLOAD_RUN_ON_STOP=false`

## API endpoints

- `GET /health`
- `GET /status`
- `GET /camera/latest.jpg`
- `GET /camera/stream.mjpeg`
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

### `deepracer`
- Writes directly to the DeepRacer's PWM sysfs nodes and actuator-enable GPIO.
- Intended for running `vehicle-runtime` on the car itself when the stock manual-drive stack is unreliable.
- Uses the current DeepRacer calibration values as defaults and keeps `stop()` pinned to neutral.

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
