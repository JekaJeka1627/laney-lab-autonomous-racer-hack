# External Models

Place externally-sourced models here (downloaded, pre-trained, found online, etc.).

## Adding a model

1. Create a subdirectory named after the model (e.g. `aws-sample-v1/`)
2. Place model file(s) inside (`.onnx`, `.pt`, `.tar.gz`, etc.)
3. Register it in the registry:

```bash
python -m model_registry.cli add \
  --name "AWS Sample v1" \
  --source-type external \
  --local-path "models/external/aws-sample-v1/model.onnx" \
  --format onnx \
  --source-notes "Downloaded from AWS DeepRacer community models" \
  --author "AWS"
```

## Conventions

- One subdirectory per model version
- Include any config files or metadata that shipped with the model
- Do not commit large binary files to git -- use `.gitignore` and document the download source
