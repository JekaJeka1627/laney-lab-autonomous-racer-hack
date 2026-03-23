"""
Active Model Switcher -- select, activate, and log model switches.

Maintains active_model.json as the current pointer and appends every
switch event to switch_log.jsonl for audit history.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from model_registry.registry_core import REGISTRY_DIR, get_model, load_registry

ACTIVE_MODEL_FILE = REGISTRY_DIR / "active_model.json"
SWITCH_LOG_FILE = REGISTRY_DIR / "switch_log.jsonl"

# The vehicle runtime looks for a model at this path.
# This can be overridden via VEHICLE_MODEL_DEPLOY_DIR env var.
DEFAULT_DEPLOY_DIR = REGISTRY_DIR.parent / "services" / "vehicle-runtime" / ".active-model"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_active_model_id() -> str | None:
    """Return the currently active model id, or None."""
    if not ACTIVE_MODEL_FILE.exists():
        return None
    data = json.loads(ACTIVE_MODEL_FILE.read_text(encoding="utf-8"))
    return data.get("active_model_id")


def get_active_model_info() -> dict | None:
    """Return full info about the active model, or None."""
    model_id = get_active_model_id()
    if not model_id:
        return None
    entry = get_model(model_id)
    if not entry:
        return {"active_model_id": model_id, "error": "Model not found in registry"}
    return {"active_model_id": model_id, **entry.to_dict()}


def _log_switch(model_id: str, previous_id: str | None, operator: str, note: str) -> None:
    """Append a switch event to switch_log.jsonl."""
    record = {
        "timestamp": _now_iso(),
        "action": "switch",
        "model_id": model_id,
        "previous_model_id": previous_id,
        "operator": operator,
        "note": note,
    }
    with open(SWITCH_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def _deploy_model_files(model_id: str, deploy_dir: Path) -> Path:
    """
    Copy or prepare model files into the deploy directory.

    Returns the deploy directory path. If the model has a local_path,
    copies files there. Otherwise creates a marker file so the vehicle
    runtime knows which model to fetch from the API.
    """
    deploy_dir.mkdir(parents=True, exist_ok=True)

    # Clear previous deployment
    for item in deploy_dir.iterdir():
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()

    entry = get_model(model_id)
    if not entry:
        raise ValueError(f"Model '{model_id}' not found in registry.")

    # If local_path exists, copy model files into deploy dir
    if entry.local_path:
        src = Path(entry.local_path)
        if not src.is_absolute():
            src = REGISTRY_DIR / src
        if src.is_dir():
            for item in src.iterdir():
                dest = deploy_dir / item.name
                if item.is_dir():
                    shutil.copytree(item, dest)
                else:
                    shutil.copy2(item, dest)
        elif src.is_file():
            shutil.copy2(src, deploy_dir / src.name)
        else:
            print(f"Warning: local_path '{entry.local_path}' not found, writing marker only.")

    # Write a marker file so the runtime can identify the active model
    marker = {
        "model_id": model_id,
        "display_name": entry.display_name,
        "format": entry.format,
        "version": entry.version,
        "deployed_at": _now_iso(),
    }
    (deploy_dir / "active_model_marker.json").write_text(
        json.dumps(marker, indent=2) + "\n", encoding="utf-8"
    )
    return deploy_dir


def set_active_model(
    model_id: str,
    operator: str = "",
    note: str = "",
    deploy: bool = True,
    deploy_dir: Path | None = None,
) -> dict:
    """
    Set the active model by id.

    - Updates active_model.json
    - Logs the switch to switch_log.jsonl
    - Optionally deploys model files to the vehicle runtime directory

    Returns a summary dict.
    """
    entry = get_model(model_id)
    if not entry:
        raise ValueError(f"Model '{model_id}' not found in registry.")
    if entry.status == "archived":
        raise ValueError(f"Model '{model_id}' is archived. Un-archive it first.")

    previous_id = get_active_model_id()
    if previous_id == model_id:
        return {
            "status": "no_change",
            "message": f"Model '{model_id}' is already the active model.",
        }

    # Update pointer
    ACTIVE_MODEL_FILE.write_text(
        json.dumps({"active_model_id": model_id, "switched_at": _now_iso()}, indent=2) + "\n",
        encoding="utf-8",
    )

    # Log it
    _log_switch(model_id, previous_id, operator, note)

    result = {
        "status": "switched",
        "model_id": model_id,
        "display_name": entry.display_name,
        "previous_model_id": previous_id,
    }

    # Deploy files
    if deploy:
        target = deploy_dir or DEFAULT_DEPLOY_DIR
        _deploy_model_files(model_id, target)
        result["deployed_to"] = str(target)

    return result


def get_switch_history(limit: int = 20) -> list[dict]:
    """Return recent switch log entries (newest first)."""
    if not SWITCH_LOG_FILE.exists():
        return []
    lines = SWITCH_LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
    entries = [json.loads(line) for line in lines if line.strip()]
    entries.reverse()
    return entries[:limit]
