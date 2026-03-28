from __future__ import annotations

import csv
import io
import json
import time
import uuid
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

from vehicle_runtime.actuators import ControlCommand


@dataclass
class SessionFrame:
    timestamp_ms: int
    frame_idx: int
    rgb: np.ndarray


@dataclass
class SessionControl:
    timestamp_ms: int
    frame_idx: int
    steering: float
    throttle: float
    control_mode: str


@dataclass
class SessionArtifacts:
    session_id: str
    root_dir: Path
    frames_zip_path: Path
    controls_csv_path: Path
    run_json_path: Path
    frame_count: int
    duration_s: float


@dataclass
class RunSessionLogger:
    cache_dir: Path
    user_id: str
    track_id: str
    sim_build: str
    client_build: str
    _session_id: str | None = None
    _start_time: float | None = None
    _model_version: str | None = None
    _frames: list[SessionFrame] = field(default_factory=list)
    _controls: list[SessionControl] = field(default_factory=list)

    @property
    def active(self) -> bool:
        return self._session_id is not None

    @property
    def session_id(self) -> str | None:
        return self._session_id

    def start(self, *, model_version: str | None) -> str:
        if self._session_id is not None:
            return self._session_id
        self._session_id = str(uuid.uuid4())
        self._start_time = time.time()
        self._model_version = model_version
        self._frames.clear()
        self._controls.clear()
        return self._session_id

    def stop(self) -> SessionArtifacts | None:
        if self._session_id is None or self._start_time is None:
            return None
        artifacts = self._export_artifacts()
        self._session_id = None
        self._start_time = None
        self._model_version = None
        self._frames.clear()
        self._controls.clear()
        return artifacts

    def record(self, *, frame_rgb: np.ndarray, command: ControlCommand, control_mode: str) -> None:
        if self._session_id is None or self._start_time is None:
            return
        ts_ms = int((time.time() - self._start_time) * 1000)
        frame_idx = len(self._frames)
        self._frames.append(SessionFrame(timestamp_ms=ts_ms, frame_idx=frame_idx, rgb=frame_rgb.copy()))
        self._controls.append(SessionControl(
            timestamp_ms=ts_ms,
            frame_idx=frame_idx,
            steering=command.steering,
            throttle=command.throttle,
            control_mode=control_mode,
        ))

    def _export_artifacts(self) -> SessionArtifacts:
        assert self._session_id is not None and self._start_time is not None
        root_dir = self.cache_dir / "sessions" / self._session_id
        root_dir.mkdir(parents=True, exist_ok=True)

        frames_zip_path = root_dir / "frames.zip"
        controls_csv_path = root_dir / "controls.csv"
        run_json_path = root_dir / "run.json"
        duration_s = max(0.0, time.time() - self._start_time)

        with zipfile.ZipFile(frames_zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in self._frames:
                image = Image.fromarray(item.rgb.astype(np.uint8), mode="RGB")
                buf = io.BytesIO()
                image.save(buf, format="JPEG", quality=80)
                zf.writestr(f"frames/{item.frame_idx:06d}.jpg", buf.getvalue())

        with controls_csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["frame_idx", "timestamp_ms", "steering", "throttle", "control_mode"])
            for c in self._controls:
                writer.writerow([c.frame_idx, c.timestamp_ms, f"{c.steering:.6f}", f"{c.throttle:.6f}", c.control_mode])

        run_json = {
            "run_id": self._session_id,
            "user_id": self.user_id,
            "track_id": self.track_id,
            "mode": "autonomous",
            "model_version": self._model_version,
            "started_at": self._start_time,
            "duration_s": duration_s,
            "frame_count": len(self._frames),
            "sim_build": self.sim_build,
            "client_build": self.client_build,
        }
        run_json_path.write_text(json.dumps(run_json, indent=2), encoding="utf-8")

        return SessionArtifacts(
            session_id=self._session_id,
            root_dir=root_dir,
            frames_zip_path=frames_zip_path,
            controls_csv_path=controls_csv_path,
            run_json_path=run_json_path,
            frame_count=len(self._frames),
            duration_s=duration_s,
        )

