# Archived Models

Retired or superseded models are moved here for reference.

Models are archived via the CLI:

```bash
python -m model_registry.cli archive <model_id>
```

Archived models remain in the registry with `status: archived` and are hidden
from the default `list` command. Use `--all` to see them:

```bash
python -m model_registry.cli list --all
```

You can also physically move model files here from `external/` or `class/`
to keep the active directories clean.
