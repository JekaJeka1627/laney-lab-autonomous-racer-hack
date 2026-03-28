from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from vehicle_runtime.explorer.track_model_adapter import TrackModelAdapter
from vehicle_runtime.preprocess import frame_to_model_input_nchw


class SteeringPredictor(Protocol):
    def predict_steering(self, frame_rgb: np.ndarray) -> float: ...


@dataclass
class ConstantSteeringPredictor:
    steering: float = 0.0

    def predict_steering(self, frame_rgb: np.ndarray) -> float:  # pragma: no cover - trivial
        return float(self.steering)


class OnnxSteeringPredictor:
    def __init__(self, model_path: Path):
        try:
            import onnxruntime as ort
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("onnxruntime is required for ONNX inference.") from exc

        self._ort = ort
        self._session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name

    def predict_steering(self, frame_rgb: np.ndarray) -> float:
        x = frame_to_model_input_nchw(frame_rgb)
        outputs = self._session.run([self._output_name], {self._input_name: x})
        value = float(np.asarray(outputs[0]).reshape(-1)[0])
        return max(-1.0, min(1.0, value))


class TrackModelPredictor:
    """Adapter-backed predictor for DeepRacer TensorFlow frozen graphs."""

    def __init__(self, model_path: Path, model_id: str = "", display_name: str = ""):
        model_path = Path(model_path)
        model_dir = model_path if model_path.is_dir() else model_path.parent
        self._adapter = TrackModelAdapter(model_dir, model_id=model_id, display_name=display_name)
        if not self._adapter.load():
            raise RuntimeError(f"Failed to load DeepRacer track model from {model_dir}")

    def predict_steering(self, frame_rgb: np.ndarray) -> float:
        # Frame sources provide RGB; adapter preprocessing expects BGR.
        frame_bgr = frame_rgb[:, :, ::-1]
        prediction = self._adapter.predict(frame_bgr)
        if prediction is None:
            raise RuntimeError("DeepRacer track model inference failed")
        steering, _throttle = prediction
        return max(-1.0, min(1.0, float(steering)))


class AutoSteeringPredictor:
    """Select the appropriate predictor based on the model artifact type."""

    def __init__(self, model_path: Path):
        suffix = model_path.suffix.lower()
        if suffix == ".onnx":
            self._impl: SteeringPredictor = OnnxSteeringPredictor(model_path)
        elif suffix == ".pb":
            self._impl = TrackModelPredictor(model_path)
        else:
            raise RuntimeError(f"Unsupported model format: {model_path.name}")

    def predict_steering(self, frame_rgb: np.ndarray) -> float:
        return self._impl.predict_steering(frame_rgb)


DeepRacerTrackPredictor = TrackModelPredictor

