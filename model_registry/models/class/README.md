# Class-Trained Models

Place models trained on class-generated driving data here.

## Adding a model

1. Create a subdirectory with a descriptive name (e.g. `class-v001-oval/`)
2. Place the exported model file(s) inside
3. Register it:

```bash
python -m model_registry.cli add \
  --name "Class v001 - Oval Track" \
  --source-type class \
  --local-path "models/class/class-v001-oval/model.onnx" \
  --format onnx \
  --trained-for "oval" \
  --team "Team 1" \
  --notes "Trained on 500 laps of class driving data from oval track"
```

## Conventions

- Include training metadata (dataset size, epochs, hyperparams) in a `training_info.json` alongside the model
- Name directories with version numbers for traceability
- Document which dataset/runs were used for training
