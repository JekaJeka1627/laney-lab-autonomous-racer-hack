# Class Model Adaptation Plan

How to turn student-generated simulator driving data into models
that run on the physical DeepRacer.

## The Problem

PilotNet-style models (behavioral cloning / imitation learning) are
incompatible with the standard AWS DeepRacer runtime because:

1. DeepRacer RL models output an **action index** (discrete) or bounded
   **(steering, speed) pairs** (continuous) -- the runtime reads
   `model_metadata.json` to interpret outputs
2. PilotNet outputs a **single continuous steering float** via regression
3. No `model_metadata.json`, no action space definition, different
   tensor shape

However, our **custom vehicle runtime** (`services/vehicle-runtime/`)
already uses a `SteeringPredictor` protocol that expects exactly one
float in `[-1, 1]` -- which is what PilotNet produces. So the
adaptation path is straightforward.

## Student Data Format (from simulator)

Each driving run exports:
- `frames/` -- camera images (PNG, from IndexedDB capture)
- `controls.csv` -- rows of: `t, steering, throttle, speed, x, z, rotation`
  - `steering`: float in [-1, 1] (left to right)
  - `throttle`: float in [0, 1]
- `run.json` -- run metadata (track, laps, duration, etc.)

This is already in the right shape for behavioral cloning:
`[camera_image, steering_value]` pairs.

## Adaptation Pipeline (5 stages)

### Stage 1: Data Aggregation

Collect and merge exported run data from multiple students.

- Input: individual run exports (frames.zip + controls.csv per run)
- Process:
  - Unzip frames, pair each frame with its control row by timestamp
  - Filter bad data: runs with 0 laps, excessive off-track, no-movement
    (the simulator already has anomaly flagging via `flagAnomalies()`)
  - Normalize: ensure consistent image size (160x120 RGB, matching
    the vehicle runtime's `preprocess.py` expectation)
  - Split into train/val sets (80/20, stratified by track if multiple)
- Output: a clean dataset directory:
  ```
  datasets/
    class-dataset-v001/
      train/
        frames/     (PNG images, named by index)
        labels.csv  (index, steering, throttle)
      val/
        frames/
        labels.csv
      metadata.json (run count, frame count, tracks, date range)
  ```

Where to build: `services/trainer/data_pipeline/`

### Stage 2: Model Training (Behavioral Cloning)

Train a PilotNet-style CNN on the aggregated data.

- Architecture: PilotNet (NVIDIA) or similar shallow CNN
  - Input: 160x120x3 RGB image (or 160x120x1 greyscale)
  - Output: single float (steering angle in [-1, 1])
  - Optionally: second output head for throttle
- Framework: PyTorch (matches repo conventions)
- Training:
  - Loss: MSE on steering prediction
  - Augmentation: horizontal flip (negate steering), brightness jitter,
    small translation/rotation
  - Epochs: 20-50 (small dataset, watch for overfitting)
  - Batch size: 32-64
- Export: PyTorch -> ONNX (for the vehicle runtime's OnnxSteeringPredictor)
  - `torch.onnx.export()` with input shape [1, 3, 120, 160]
  - Verify output shape is [1, 1] (single steering value)

Where to build: `services/trainer/train_pilotnet.py`

### Stage 3: ONNX Export and Validation

Ensure the exported model works with the vehicle runtime's predictor.

- Export command: `python -m services.trainer.train_pilotnet --export`
- Validation checks:
  - Load with `onnxruntime`, verify input/output names and shapes
  - Run inference on a few sample frames, confirm output is in [-1, 1]
  - Compare ONNX output vs PyTorch output (should match within epsilon)
- The exported model goes into `model_registry/models/class/<name>/model.onnx`

Where to build: `services/trainer/export_onnx.py`

### Stage 4: Registration and Deployment

Use the model registry to register and activate the class model.

```bash
# Register the trained model
python -m model_registry add \
  --name "Class v001 - Oval BC" \
  --source-type class \
  --local-path "models/class/class-v001-oval/model.onnx" \
  --format onnx \
  --trained-for "oval" \
  --team "Period 3" \
  --notes "Behavioral cloning on 500 frames from 12 students"

# Set it as the active model
python -m model_registry set-active <model_id> \
  --operator "Jesse" \
  --note "First class-trained model test"
```

The switcher copies the ONNX file to
`services/vehicle-runtime/.active-model/` where the runtime loads it.

### Stage 5: Physical Testing and Evaluation

Run the model on the racer and log results.

```bash
# Start vehicle runtime (it loads from .active-model/)
cd services/vehicle-runtime
uvicorn vehicle_runtime.main:app --port 8100

# After the physical run, log results
python -m model_registry log-eval <model_id> \
  --track "lab-oval" --laps 3 --completion partial \
  --off-track 5 --operator "Craig" \
  --notes "Tends to oversteer on curves, holds center well on straights"

# Compare against external RL models
python -m model_registry compare
```

## Compatibility Matrix

| Component               | RL Models (drfc-ppo, center-align) | Class BC Models     |
|-------------------------|------------------------------------|---------------------|
| Format                  | TensorFlow .pb                     | ONNX (.onnx)        |
| Output                  | Action index / bounded pair        | Steering float [-1,1]|
| Action space metadata   | Required (model_metadata.json)     | Not needed           |
| Vehicle runtime path    | Needs TF adapter (future)          | Works NOW via OnnxSteeringPredictor |
| Throttle                | Part of action space               | Fixed (config default_throttle) |
| Preprocessing           | Model-specific                     | 160x120 RGB, /255   |

Key insight: **class-trained BC models are actually easier to deploy**
on our custom runtime than the standard DeepRacer RL models, because
our `OnnxSteeringPredictor` already expects exactly the output format
that PilotNet produces.

## What Needs to Be Built

| Priority | Component | Location | Status |
|----------|-----------|----------|--------|
| P0 | Data aggregation script | `services/trainer/data_pipeline/` | Not started |
| P0 | PilotNet training script | `services/trainer/train_pilotnet.py` | Not started |
| P0 | ONNX export + validation | `services/trainer/export_onnx.py` | Not started |
| P1 | Dataset quality dashboard | `services/trainer/inspect_dataset.py` | Not started |
| P1 | Training config (hyperparams) | `services/trainer/config.yaml` | Not started |
| P2 | TF adapter for RL models | `vehicle_runtime/predictor.py` | Not started |
| P2 | Greyscale preprocessing option | `vehicle_runtime/preprocess.py` | Not started |

## Risk Mitigations

- **Sim-to-real gap**: Simulator visuals differ from physical track camera.
  Mitigate with augmentation (brightness, contrast, blur) and by collecting
  some physical driving data later.
- **Small dataset**: Class may only produce hundreds of frames. Mitigate
  with aggressive augmentation and simpler model architecture.
- **Steering-only model**: Throttle is fixed via `default_throttle` config.
  This is fine for v1 but limits speed adaptation. Can add throttle head later.
- **Overfitting**: Small dataset + deep network = risk. Use dropout, early
  stopping, and keep the network shallow (PilotNet is already small).

## Decision Record

The team noted that "PilotNet-based models won't work as-is in DeepRacer."
This is correct for the **standard AWS DeepRacer runtime** but NOT for our
custom vehicle runtime. Our path forward:

- Class BC models -> ONNX -> OnnxSteeringPredictor (works now)
- External RL models -> need TF adapter or ONNX conversion (future work)

Reference: https://cse.buffalo.edu/~avereshc/rl_fall20/AWS_Deep_Racer_Upmanyu_Tyagi.pdf
