from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Protocol

import numpy as np


class FrameSource(Protocol):
    def read_rgb(self) -> np.ndarray: ...
    def close(self) -> None: ...


@dataclass(slots=True)
class MockFrameSource:
    width: int = 160
    height: int = 120
    _tick: int = 0

    def read_rgb(self) -> np.ndarray:
        self._tick += 1
        x = np.linspace(0, 255, self.width, dtype=np.uint8)
        y = np.linspace(0, 255, self.height, dtype=np.uint8)
        xx = np.tile(x, (self.height, 1))
        yy = np.tile(y[:, None], (1, self.width))
        pulse = np.uint8((time.time() * 50 + self._tick * 3) % 255)
        rgb = np.stack([xx, yy, np.full_like(xx, pulse)], axis=2)
        return rgb

    def close(self) -> None:
        return None


class OpenCvFrameSource:
    def __init__(self, device_index: int, width: int, height: int):
        try:
            import cv2
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("opencv-python-headless is required for OpenCV camera capture.") from exc
        self._cv2 = cv2
        self._cap = cv2.VideoCapture(device_index)
        if not self._cap.isOpened():
            raise RuntimeError(f"Failed to open camera device {device_index}")
        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

    def read_rgb(self) -> np.ndarray:
        ok, frame_bgr = self._cap.read()
        if not ok or frame_bgr is None:
            raise RuntimeError("Camera frame capture failed")
        return self._cv2.cvtColor(frame_bgr, self._cv2.COLOR_BGR2RGB)

    def close(self) -> None:
        self._cap.release()


def build_frame_source(*, backend: str, device_index: int, width: int, height: int) -> FrameSource:
    if backend == "mock":
        return MockFrameSource(width=width, height=height)
    if backend == "opencv":
        return OpenCvFrameSource(device_index=device_index, width=width, height=height)
    raise ValueError(f"Unsupported camera backend: {backend}")

