"""
Evaluation Logger -- log physical run results by active model.

Stores evaluation entries in eval_log.jsonl (one JSON object per line).
Each entry records a physical run's outcome tied to a specific model.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

REGISTRY_DIR = Path(__file__).resolve().parent
EVAL_LOG_FILE = REGISTRY_DIR / "eval_log.jsonl"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def log_eval(
    model_id: str,
    track: str = "",
    lap_count: int = 0,
    completion_status: str = "",
    off_track_count: int = 0,
    crash_count: int = 0,
    avg_speed: float | None = None,
    operator: str = "",
    notes: str = "",
) -> dict:
    """
    Log a physical evaluation run for the given model.

    Returns the logged entry dict.
    """
    entry = {
        "eval_id": str(uuid.uuid4())[:8],
        "timestamp": _now_iso(),
        "model_id": model_id,
        "track": track,
        "lap_count": lap_count,
        "completion_status": completion_status,
        "off_track_count": off_track_count,
        "crash_count": crash_count,
        "avg_speed": avg_speed,
        "operator": operator,
        "notes": notes,
    }
    with open(EVAL_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def load_eval_log() -> list[dict]:
    """Load all evaluation entries."""
    if not EVAL_LOG_FILE.exists():
        return []
    lines = EVAL_LOG_FILE.read_text(encoding="utf-8").strip().splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def get_evals_for_model(model_id: str) -> list[dict]:
    """Return all evaluation entries for a given model."""
    return [e for e in load_eval_log() if e.get("model_id") == model_id]
