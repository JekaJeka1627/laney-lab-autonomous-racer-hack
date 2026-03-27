"""
Active Model Switcher -- select, activate, and log model switches.

Maintains active_model.json as the current pointer and appends every
switch event to switch_log.jsonl for audit history.
"""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from model_registry.registry_core import REGISTRY_DIR, get_model, load_registry

ACTIVE_MODEL_FILE = REGISTRY_DIR / "active_model.json"
SWITCH_LOG_FILE = REGISTRY_DIR / "switch_log.jsonl"

# The vehicle runtime auto-discovers models from this directory.
# Override with VEHICLE_MODEL_DEPLOY_DIR env var if the runtime lives elsewhere.
_env_deploy = os.getenv("VEHICLE_MODEL_DEPLOY_DIR")
DEFAULT_DEPLOY_DIR = (
    Path(_env_deploy).resolve() if _env_deploy
    else (REGISTRY_DIR.parent / "services" / "vehicle-runtime" / ".active-model").resolve()
)

# If the vehicle runtime API is reachable, notify it after deploy.
VEHICLE_RUNTIME_URL = os.getenv("VEHICLE_RUNTIME_URL", "http://localhost:8100")


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

    # Deploy files to the vehicle runtime
    if deploy:
        if _runtime_is_remote():
            # Runtime is on a different machine (racer on WiFi) -- push the model
            # file over HTTP so the racer receives it without needing a shared filesystem
            pushed = _push_model_to_runtime(model_id, deploy_dir or DEFAULT_DEPLOY_DIR)
            result["deployed_via"] = "wifi_push"
            result["runtime_notified"] = pushed
            result["deployed_to"] = VEHICLE_RUNTIME_URL
        else:
            # Runtime is local -- copy files directly to the watched directory
            target = deploy_dir or DEFAULT_DEPLOY_DIR
            _deploy_model_files(model_id, target)
            result["deployed_to"] = str(target)
            result["deployed_via"] = "local_copy"
            reloaded = _notify_runtime_reload()
            result["runtime_notified"] = reloaded

    return result


def _runtime_is_remote() -> bool:
    """Return True if the vehicle runtime is on a different machine (not localhost)."""
    import urllib.parse
    parsed = urllib.parse.urlparse(VEHICLE_RUNTIME_URL)
    host = parsed.hostname or ""
    return host not in ("localhost", "127.0.0.1", "::1")


def _push_model_to_runtime(model_id: str, local_path: Path) -> bool:
    """
    Push a model file to the remote vehicle runtime over WiFi via HTTP.
    Used when the runtime is on a different machine (e.g. racer on WiFi).
    Returns True if successfully pushed.
    """
    import urllib.request
    import urllib.parse
    import mimetypes

    entry = get_model(model_id)
    if not entry:
        return False

    # Find the model file to push
    src = Path(entry.local_path) if entry.local_path else None
    if src and not src.is_absolute():
        src = REGISTRY_DIR / src

    if not src or not src.exists():
        print(f"Warning: no local model file found for '{model_id}', runtime won't reload new weights.")
        return False

    # If it's a directory, find the primary model file inside it
    model_file: Path | None = None
    if src.is_dir():
        for ext in (".pb", ".onnx", ".tflite", ".pt", ".pth"):
            candidates = list(src.rglob(f"*{ext}"))
            if candidates:
                model_file = candidates[0]
                break
    elif src.is_file():
        model_file = src

    if model_file is None:
        print(f"Warning: could not find a model weight file in '{src}'")
        return False

    # Multipart form upload to /model/push
    boundary = "----ModelPushBoundary"
    filename = model_file.name
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    with open(model_file, "rb") as f:
        file_data = f.read()

    parts = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("utf-8") + file_data + (
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="model_id"\r\n\r\n{model_id}'
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="display_name"\r\n\r\n{entry.display_name}'
        f"\r\n--{boundary}\r\n"
        f'Content-Disposition: form-data; name="format"\r\n\r\n{entry.format}'
        f"\r\n--{boundary}--\r\n"
    ).encode("utf-8")

    url = f"{VEHICLE_RUNTIME_URL}/model/push?model_id={urllib.parse.quote(model_id)}&display_name={urllib.parse.quote(entry.display_name)}&format={urllib.parse.quote(entry.format)}"
    req = urllib.request.Request(
        url,
        data=parts,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"Warning: model push to runtime failed: {e}")
        return False


def _notify_runtime_reload() -> bool:
    """
    Poke the vehicle runtime's /model/reload endpoint so it picks up
    the new model immediately instead of waiting for the next refresh cycle.

    Returns True if the runtime acknowledged, False if unreachable (not an error).
    """
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{VEHICLE_RUNTIME_URL}/model/reload",
            method="POST",
            data=b"",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        # Runtime not running or unreachable -- that's fine,
        # it will auto-detect the new marker on next tick.
        return False


def get_switch_history(limit: int = 20) -> list[dict]:
    """Return recent switch log entries (newest first)."""
    if not SWITCH_LOG_FILE.exists():
        return []
    lines = SWITCH_LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
    entries = [json.loads(line) for line in lines if line.strip()]
    entries.reverse()
    return entries[:limit]
