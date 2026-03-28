from __future__ import annotations

import time
from dataclasses import dataclass
from io import BytesIO
import subprocess
from typing import Protocol

import numpy as np


class FrameSource(Protocol):
    def read_rgb(self) -> np.ndarray: ...
    def close(self) -> None: ...


@dataclass
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


class OneShotOpenCvFrameSource:
    """Opens the camera device for each read, then closes it immediately.

    This is slower than a persistent capture handle, but it is more reliable on
    the DeepRacer image where long-lived OpenCV handles can fail or wedge after
    startup while one-shot reads still succeed.
    """

    def __init__(self, device_index: int, width: int, height: int):
        try:
            import cv2
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("opencv-python-headless is required for OpenCV camera capture.") from exc
        self._cv2 = cv2
        self._device_index = device_index
        self._width = width
        self._height = height
        self._last_rgb: np.ndarray | None = None

    def read_rgb(self) -> np.ndarray:
        cap = self._cv2.VideoCapture(self._device_index)
        try:
            if not cap.isOpened():
                raise RuntimeError(f"Failed to open camera device {self._device_index}")
            cap.set(self._cv2.CAP_PROP_FRAME_WIDTH, self._width)
            cap.set(self._cv2.CAP_PROP_FRAME_HEIGHT, self._height)
            ok, frame_bgr = cap.read()
            if not ok or frame_bgr is None:
                raise RuntimeError("Camera frame capture failed")
            rgb = self._cv2.cvtColor(frame_bgr, self._cv2.COLOR_BGR2RGB)
            self._last_rgb = rgb
            return rgb
        except Exception:
            if self._last_rgb is not None:
                return self._last_rgb.copy()
            raise
        finally:
            cap.release()

    def close(self) -> None:
        return None


class SnapshotHttpFrameSource:
    """Reads frames from an HTTP JPEG snapshot endpoint.

    Intended for DeepRacer images where the stock `web_video_server` already
    exposes camera frames but direct OpenCV access to /dev/video* is flaky.
    """

    def __init__(self, snapshot_url: str, width: int, height: int):
        try:
            import requests  # type: ignore
            from PIL import Image
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("requests and Pillow are required for snapshot camera capture.") from exc
        self._requests = requests
        self._Image = Image
        self._snapshot_url = snapshot_url
        self._width = width
        self._height = height
        self._last_rgb: np.ndarray | None = None

    def read_rgb(self) -> np.ndarray:
        try:
            response = self._requests.get(self._snapshot_url, timeout=5)
            response.raise_for_status()
            image = self._Image.open(BytesIO(response.content)).convert("RGB")
            if image.size != (self._width, self._height):
                image = image.resize((self._width, self._height))
            rgb = np.array(image, dtype=np.uint8)
            self._last_rgb = rgb
            return rgb
        except Exception:
            if self._last_rgb is not None:
                return self._last_rgb.copy()
            raise RuntimeError("Snapshot camera frame capture failed")

    def close(self) -> None:
        return None


class FfmpegFrameSource:
    """Captures a single JPEG frame via ffmpeg from a V4L2 device."""

    def __init__(self, device_index: int, width: int, height: int):
        try:
            from PIL import Image
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("Pillow is required for ffmpeg camera capture.") from exc
        self._Image = Image
        self._device_path = f"/dev/video{device_index}"
        self._width = width
        self._height = height
        self._last_rgb: np.ndarray | None = None

    def read_rgb(self) -> np.ndarray:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "video4linux2",
            "-input_format",
            "mjpeg",
            "-video_size",
            "640x480",
            "-i",
            self._device_path,
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "-",
        ]
        try:
            proc = subprocess.run(
                cmd,
                check=True,
                capture_output=True,
                timeout=8,
            )
            image = self._Image.open(BytesIO(proc.stdout)).convert("RGB")
            if image.size != (self._width, self._height):
                image = image.resize((self._width, self._height))
            rgb = np.array(image, dtype=np.uint8)
            self._last_rgb = rgb
            return rgb
        except Exception:
            if self._last_rgb is not None:
                return self._last_rgb.copy()
            raise RuntimeError(f"ffmpeg camera frame capture failed for {self._device_path}")

    def close(self) -> None:
        return None


def build_frame_source(*, backend: str, device_index: int, width: int, height: int) -> FrameSource:
    if backend == "mock":
        return MockFrameSource(width=width, height=height)
    if backend == "opencv":
        return OpenCvFrameSource(device_index=device_index, width=width, height=height)
    if backend == "opencv_oneshot":
        return OneShotOpenCvFrameSource(device_index=device_index, width=width, height=height)
    if backend == "deepracer_snapshot":
        return SnapshotHttpFrameSource(
            snapshot_url="http://127.0.0.1:8080/snapshot?topic=/camera_pkg/display_mjpeg",
            width=width,
            height=height,
        )
    if backend == "ffmpeg":
        return FfmpegFrameSource(device_index=device_index, width=width, height=height)
    raise ValueError(f"Unsupported camera backend: {backend}")

