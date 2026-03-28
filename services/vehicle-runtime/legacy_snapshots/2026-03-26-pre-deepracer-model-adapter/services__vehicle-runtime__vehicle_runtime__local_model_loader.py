"""
Local model loader -- discovers and loads models from a local directory.

The model switcher deploys files to a local directory (default: .active-model/).
This module watches that directory and provides the runtime with:
- The path to the current ONNX model file
- The model ID and version from the marker file
- Change detection so the runtime auto-reloads on switch

Zero config required: if .active-model/ contains an ONNX file, it just works.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MARKER_FILENAME = "active_model_marker.json"


def find_onnx_file(model_dir: Path) -> Path | None:
    """Find the first .onnx file in the model directory."""
    if not model_dir.is_dir():
        return None
    onnx_files = sorted(model_dir.glob("*.onnx"))
    if onnx_files:
        return onnx_files[0]
    # Check one level deeper (some archives extract into a subfolder)
    for sub in sorted(model_dir.iterdir()):
        if sub.is_dir():
            nested = sorted(sub.glob("*.onnx"))
            if nested:
                return nested[0]
    return None


def read_marker(model_dir: Path) -> dict | None:
    """Read the active_model_marker.json if it exists."""
    marker_path = model_dir / MARKER_FILENAME
    if not marker_path.is_file():
        return None
    try:
        return json.loads(marker_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read model marker: %s", exc)
        return None


def get_marker_deployed_at(model_dir: Path) -> str | None:
    """Return the deployed_at timestamp from the marker, used for change detection."""
    marker = read_marker(model_dir)
    if marker:
        return marker.get("deployed_at")
    return None


def resolve_local_model(model_dir: Path) -> dict | None:
    """
    Attempt to resolve a loadable model from the local directory.

    Returns a dict with model info if found, None otherwise:
        {
            "model_path": Path,      # absolute path to .onnx file
            "model_id": str,         # from marker or "local"
            "model_version": str,    # from marker or file mtime
            "deployed_at": str,      # from marker or ""
            "display_name": str,     # from marker or filename
            "source": "local",
        }
    """
    if not model_dir.is_dir():
        return None

    onnx_path = find_onnx_file(model_dir)
    if not onnx_path:
        return None

    marker = read_marker(model_dir) or {}
    model_id = marker.get("model_id", "local")
    version = marker.get("version", str(int(onnx_path.stat().st_mtime)))
    deployed_at = marker.get("deployed_at", "")
    display_name = marker.get("display_name", onnx_path.stem)

    return {
        "model_path": onnx_path,
        "model_id": model_id,
        "model_version": f"{model_id}@{version}",
        "deployed_at": deployed_at,
        "display_name": display_name,
        "source": "local",
    }
