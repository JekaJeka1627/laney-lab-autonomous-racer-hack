from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from vehicle_runtime.preprocess import frame_to_model_input_nchw


class SteeringPredictor(Protocol):
    def predict_steering(self, frame_rgb: np.ndarray) -> float: ...


@dataclass(slots=True)
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

