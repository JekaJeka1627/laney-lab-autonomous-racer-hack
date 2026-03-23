"""
Model Registry -- core CRUD operations for managing model entries.

Storage: a single registry.json file with an array of model entries.
Each entry has a unique id, metadata, and paths to the model artifacts.
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

REGISTRY_DIR = Path(__file__).resolve().parent
REGISTRY_FILE = REGISTRY_DIR / "registry.json"

VALID_SOURCE_TYPES = ("external", "class")
VALID_STATUSES = ("ready", "testing", "archived")
VALID_FORMATS = ("onnx", "pytorch", "openvino", "tflite", "other")


@dataclass
class ModelEntry:
    """A single model in the registry."""

    id: str
    display_name: str
    source_type: Literal["external", "class"]
    source_notes: str = ""
    local_path: str = ""
    remote_path: str = ""
    format: str = "onnx"
    version: str = "1"
    date_added: str = ""
    trained_for: str = ""
    author: str = ""
    team: str = ""
    status: Literal["ready", "testing", "archived"] = "ready"
    notes: str = ""
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> ModelEntry:
        # Only pass known fields to avoid errors on extra keys
        known = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(**filtered)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_registry() -> list[ModelEntry]:
    """Load all model entries from registry.json."""
    if not REGISTRY_FILE.exists():
        return []
    raw = json.loads(REGISTRY_FILE.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "models" in raw:
        raw = raw["models"]
    return [ModelEntry.from_dict(m) for m in raw]


def save_registry(models: list[ModelEntry]) -> None:
    """Persist model entries to registry.json."""
    payload = {"models": [m.to_dict() for m in models], "updated_at": _now_iso()}
    REGISTRY_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def get_model(model_id: str) -> ModelEntry | None:
    """Look up a model by id."""
    for m in load_registry():
        if m.id == model_id:
            return m
    return None


def add_model(entry: ModelEntry) -> ModelEntry:
    """Add a new model to the registry. Generates id and date_added if missing."""
    models = load_registry()
    if not entry.id:
        entry.id = str(uuid.uuid4())[:8]
    if not entry.date_added:
        entry.date_added = _now_iso()
    # Ensure no duplicate id
    if any(m.id == entry.id for m in models):
        raise ValueError(f"Model id '{entry.id}' already exists in registry.")
    models.append(entry)
    save_registry(models)
    return entry


def update_model(model_id: str, **updates) -> ModelEntry:
    """Update fields on an existing model entry."""
    models = load_registry()
    for i, m in enumerate(models):
        if m.id == model_id:
            d = m.to_dict()
            d.update(updates)
            models[i] = ModelEntry.from_dict(d)
            save_registry(models)
            return models[i]
    raise ValueError(f"Model '{model_id}' not found.")


def archive_model(model_id: str) -> ModelEntry:
    """Set a model's status to archived."""
    return update_model(model_id, status="archived")


def list_models(
    include_archived: bool = False,
    source_type: str | None = None,
) -> list[ModelEntry]:
    """List models, optionally filtering by source_type and archive status."""
    models = load_registry()
    if not include_archived:
        models = [m for m in models if m.status != "archived"]
    if source_type:
        models = [m for m in models if m.source_type == source_type]
    return models
