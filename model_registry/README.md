# Model Registry and Switcher

Manage, switch, and evaluate driving models for the DeepRacer platform.

## Overview

This module provides:

- **Model Registry** -- register and track all available driving models (external and class-trained)
- **Active Model Switcher** -- select which model runs on the physical racer, with audit logging
- **Evaluation Logger** -- record physical run results tied to specific models
- **Comparison View** -- aggregate and compare model performance across runs

## Quick Start

All commands run from the repo root:

```bash
# List all registered models
python -m model_registry list

# Show details for a specific model
python -m model_registry show <model_id>

# See the currently active model
python -m model_registry active

# Switch to a different model
python -m model_registry set-active <model_id> --operator "Jesse" --note "Testing on oval"

# Register a new external model
python -m model_registry add \
  --name "AWS Sample v1" \
  --source-type external \
  --local-path "models/external/aws-sample-v1/model.onnx" \
  --format onnx \
  --source-notes "Downloaded from AWS community"

# Register a class-trained model
python -m model_registry add \
  --name "Class v001 - Oval" \
  --source-type class \
  --local-path "models/class/class-v001-oval/model.onnx" \
  --trained-for "oval" \
  --team "Team 1"

# Archive a model
python -m model_registry archive <model_id>

# Log a physical evaluation run
python -m model_registry log-eval <model_id> \
  --track "lab-oval" \
  --laps 5 \
  --completion full \
  --off-track 2 \
  --operator "Craig"

# View switch history
python -m model_registry history

# Compare model performance
python -m model_registry compare
python -m model_registry compare --notes
```

## Folder Structure

```text
model_registry/
  README.md               <-- this file
  registry.json            <-- model registry data (auto-generated)
  active_model.json        <-- current active model pointer (auto-generated)
  switch_log.jsonl         <-- model switch audit log (auto-generated)
  eval_log.jsonl           <-- physical run evaluation log (auto-generated)
  requirements.txt         <-- Python dependencies (stdlib only for v1)
  __init__.py
  __main__.py              <-- entry point for `python -m model_registry`
  cli.py                   <-- CLI operator interface
  registry_core.py         <-- registry CRUD operations
  switcher.py              <-- active model switching + deploy logic
  eval_logger.py           <-- evaluation logging
  comparison.py            <-- comparison/stats aggregation
  models/
    external/              <-- externally sourced models
      README.md
    class/                 <-- class-trained models
      README.md
    archive/               <-- retired models
      README.md
```

## How Model Switching Works

1. `set-active <model_id>` updates `active_model.json` with the selected model
2. If the model has a `local_path`, its files are copied to the vehicle runtime deploy directory (`services/vehicle-runtime/.active-model/`)
3. A marker file (`active_model_marker.json`) is written so the runtime knows which model is loaded
4. Every switch is logged to `switch_log.jsonl` with timestamp, operator, and previous model

The vehicle runtime reads from the deploy directory at startup or on `/model/reload`.

## How Evaluation Logging Works

After a physical test run, use `log-eval` to record results:

```bash
python -m model_registry log-eval ext-aws01 \
  --track "lab-oval" --laps 3 --completion partial \
  --off-track 4 --crashes 1 --speed 0.3 \
  --operator "Bang" --notes "Struggled on tight corners"
```

Each entry is appended to `eval_log.jsonl`. Use `compare` to see aggregate stats.

## Adding a New Model

1. Place model files in `models/external/<name>/` or `models/class/<name>/`
2. Run `python -m model_registry add --name "..." --source-type external|class --local-path "models/..."` with relevant metadata
3. The model appears in `python -m model_registry list`
4. Activate it with `python -m model_registry set-active <id>`

## Extensibility (v2+)

Designed for later addition of:

- Cloud model storage (S3/GCS download and sync)
- Telemetry streaming from physical runs
- Live dashboard for model comparison
- Model tagging by track/environment
- Student/team ownership tracking
- Rollback to previous active model
- Integration with the simulator training pipeline

## Requirements

- Python 3.10+
- No external dependencies (stdlib only)
- The vehicle runtime needs `onnxruntime` separately for inference
