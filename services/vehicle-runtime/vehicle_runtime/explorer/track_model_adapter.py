"""
Track Model Adapter -- runs a DeepRacer TF frozen-graph model for steering.

Wraps the TensorFlow .pb inference so the explorer can borrow driving skills
from a track-trained model.  Handles both discrete and continuous action spaces
and normalizes output to the explorer's [-1, 1] steering / [0, 1] throttle range.

Loading priority:
  1. Cached .onnx file alongside the .pb (fastest at runtime, no TF needed)
  2. tf2onnx conversion from .pb (one-time, then cached as .onnx)
  3. Direct TF1 frozen-graph inference via tf.compat.v1
  4. Unavailable -- returns None so callers can fall back gracefully

DeepRacer frozen-graph conventions:
  Input tensor:  main_level/agent_0/main/online/network_0/observation/observation:0
  Output tensor: main_level/agent_0/main/online/network_0/ppo_head_0/policy:0
  Input shape:   [1, 84, 84, 1]  (grayscale)  or  [1, 84, 84, 3]  (RGB)
  Output shape:  [1, N_actions]  (discrete)   or  [1, 2]           (continuous)
"""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

log = logging.getLogger(__name__)

# Standard DeepRacer TF1 frozen-graph tensor names
_INPUT_TENSOR  = "main_level/agent_0/main/online/network_0/observation/observation:0"
_OUTPUT_TENSOR = "main_level/agent_0/main/online/network_0/ppo_head_0/policy:0"
_MODEL_INPUT_SIZE = (84, 84)  # height x width used during DeepRacer training


@dataclass
class ActionSpaceEntry:
    steering_angle: float  # degrees, negative = left
    speed: float           # m/s


@dataclass
class TrackModelInfo:
    model_id: str
    display_name: str
    action_space_type: str          # "discrete" or "continuous"
    preprocess_type: str            # "GREY_SCALE" or "RGB"
    actions: list[ActionSpaceEntry] = field(default_factory=list)
    steering_min: float = -30.0     # continuous only
    steering_max: float = 30.0
    speed_min: float = 0.5
    speed_max: float = 3.0
    backend: str = "none"


class TrackModelAdapter:
    """
    Loads a DeepRacer frozen-graph model and exposes a simple
    predict(frame) -> (steering, throttle) interface.

    steering is normalized to [-1, 1]  (1 = hard right, -1 = hard left)
    throttle is normalized to [0, 1]
    """

    def __init__(self, model_dir: Path, model_id: str = "", display_name: str = ""):
        self.model_dir = Path(model_dir)
        self.model_id = model_id or model_dir.name
        self.display_name = display_name or model_dir.name
        self.info: TrackModelInfo | None = None

        # Backend state
        self._backend: str = "none"
        self._tf_session: Any = None
        self._tf_input: Any = None
        self._tf_output: Any = None
        self._ort_session: Any = None
        self._ort_input_name: str = ""
        self._ov_model: Any = None

    @property
    def is_loaded(self) -> bool:
        return self._backend != "none"

    def load(self) -> bool:
        """
        Find the model .pb file, read metadata, then load for inference.
        Returns True if successfully loaded.
        """
        # Find model.pb (may be in agent/ subdir)
        pb_path = self._find_pb()
        if pb_path is None:
            log.warning("TrackModelAdapter[%s]: no model.pb found in %s", self.model_id, self.model_dir)
            return False

        # Read action space from model_metadata.json
        self.info = self._read_metadata()

        # Try loading backends in priority order
        onnx_path = pb_path.with_suffix(".onnx")
        if not onnx_path.exists():
            onnx_path = self.model_dir / "model_adapter.onnx"

        if onnx_path.exists():
            if self._load_onnx(onnx_path):
                log.info("TrackModelAdapter[%s]: loaded via onnxruntime (%s)", self.model_id, onnx_path.name)
                return True

        if self._try_convert_and_load(pb_path, onnx_path):
            return True

        if self._load_tf(pb_path):
            log.info("TrackModelAdapter[%s]: loaded via TensorFlow", self.model_id)
            return True

        log.warning(
            "TrackModelAdapter[%s]: all backends failed. "
            "Install tensorflow-cpu or tf2onnx+onnxruntime to enable hybrid mode.",
            self.model_id,
        )
        return False

    def predict(self, frame: np.ndarray) -> tuple[float, float] | None:
        """
        Run inference on a BGR camera frame.
        Returns (steering, throttle) normalized to [-1,1] and [0,1],
        or None if the model is not loaded.
        """
        if self._backend == "none" or self.info is None:
            return None

        try:
            processed = self._preprocess(frame)
            raw = self._run_inference(processed)
            if raw is None:
                return None
            return self._decode_output(raw)
        except Exception:
            log.debug("TrackModelAdapter[%s]: inference error", self.model_id, exc_info=True)
            return None

    # ------------------------------------------------------------------
    # Private: file discovery
    # ------------------------------------------------------------------

    def _find_pb(self) -> Path | None:
        for pattern in ("**/*.pb",):
            candidates = sorted(self.model_dir.rglob("model.pb"))
            if candidates:
                return candidates[0]
        return None

    def _read_metadata(self) -> TrackModelInfo:
        meta_path = self.model_dir / "model_metadata.json"
        info = TrackModelInfo(
            model_id=self.model_id,
            display_name=self.display_name,
            action_space_type="discrete",
            preprocess_type="GREY_SCALE",
        )
        if not meta_path.exists():
            return info

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            info.action_space_type = meta.get("action_space_type", "discrete")
            info.preprocess_type = meta.get("preprocess_type", "GREY_SCALE")

            action_space = meta.get("action_space", [])
            if info.action_space_type == "discrete" and isinstance(action_space, list):
                for entry in action_space:
                    info.actions.append(ActionSpaceEntry(
                        steering_angle=float(entry.get("steering_angle", 0)),
                        speed=float(entry.get("speed", 0.5)),
                    ))
            elif info.action_space_type == "continuous" and isinstance(action_space, dict):
                steer = action_space.get("steering_angle", {})
                spd = action_space.get("speed", {})
                info.steering_min = float(steer.get("low", -30))
                info.steering_max = float(steer.get("high", 30))
                info.speed_min = float(spd.get("low", 0.5))
                info.speed_max = float(spd.get("high", 2.0))
        except Exception:
            log.warning("TrackModelAdapter[%s]: could not parse metadata", self.model_id, exc_info=True)

        return info

    # ------------------------------------------------------------------
    # Private: preprocessing
    # ------------------------------------------------------------------

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        """Resize and normalize frame to match DeepRacer model input."""
        import cv2
        h, w = self._expected_input_hw()
        resized = cv2.resize(frame, (w, h))

        grayscale = (self.info is not None and self.info.preprocess_type == "GREY_SCALE")
        if grayscale:
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            arr = gray.astype(np.float32) / 255.0
            # Shape: [1, H, W, 1]  (TF NHWC)
            return arr[np.newaxis, :, :, np.newaxis]
        else:
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            arr = rgb.astype(np.float32) / 255.0
            # Shape: [1, H, W, 3]
            return arr[np.newaxis, :, :, :]

    def _expected_input_hw(self) -> tuple[int, int]:
        """Infer model input height/width from the loaded graph when possible."""
        shape = None
        if self._tf_input is not None and hasattr(self._tf_input, "shape"):
            shape = self._tf_input.shape
        elif self._ort_session is not None:
            try:
                shape = self._ort_session.get_inputs()[0].shape
            except Exception:
                shape = None

        try:
            if shape is not None and len(shape) >= 4:
                return int(shape[1]), int(shape[2])
        except Exception:
            pass
        return _MODEL_INPUT_SIZE

    # ------------------------------------------------------------------
    # Private: inference
    # ------------------------------------------------------------------

    def _run_inference(self, batch: np.ndarray) -> np.ndarray | None:
        if self._backend == "openvino" and self._ov_model is not None:
            result = self._ov_model(batch)
            return result[self._ov_model.output(0)]
        if self._backend == "onnxruntime" and self._ort_session is not None:
            # ONNX models expect NCHW; TF models expect NHWC.
            # If converted with tf2onnx the layout is preserved (NHWC).
            result = self._ort_session.run(None, {self._ort_input_name: batch})
            return result[0]
        if self._backend == "tensorflow" and self._tf_session is not None:
            result = self._tf_session.run(
                self._tf_output,
                feed_dict={self._tf_input: batch},
            )
            return result
        return None

    # ------------------------------------------------------------------
    # Private: output decoding
    # ------------------------------------------------------------------

    def _decode_output(self, raw: np.ndarray) -> tuple[float, float]:
        """Convert raw model output to (steering [-1,1], throttle [0,1])."""
        flat = raw.flatten()

        if self.info and self.info.action_space_type == "discrete":
            if len(self.info.actions) > 0:
                idx = int(np.argmax(flat))
                idx = max(0, min(idx, len(self.info.actions) - 1))
                action = self.info.actions[idx]
                steering = action.steering_angle / 30.0  # normalize degrees → [-1,1]
                steering = max(-1.0, min(1.0, steering))
                max_speed = max(a.speed for a in self.info.actions) or 1.0
                throttle = max(0.0, min(1.0, action.speed / max_speed))
                return steering, throttle

            # Fallback: treat as single steering value
            idx = int(np.argmax(flat))
            n = len(flat)
            steering = (idx / max(n - 1, 1)) * 2.0 - 1.0
            return steering, 0.4

        else:
            # Continuous: [steering_angle, speed]
            if len(flat) >= 2:
                steer_deg = float(flat[0])
                speed_val = float(flat[1])
            else:
                steer_deg = float(flat[0]) * 30.0
                speed_val = 1.0

            # Many DeepRacer continuous frozen graphs emit normalized action values
            # in roughly [-1, 1] rather than physical units. Detect that common case
            # and map back into the metadata bounds.
            if abs(steer_deg) <= 1.5 and abs(speed_val) <= 1.5:
                steering = max(-1.0, min(1.0, steer_deg))
                throttle = max(0.0, min(1.0, (speed_val + 1.0) / 2.0))
                return steering, throttle

            smin = self.info.steering_min if self.info else -30.0
            smax = self.info.steering_max if self.info else 30.0
            steering = (steer_deg - smin) / max(smax - smin, 1e-6) * 2.0 - 1.0
            steering = max(-1.0, min(1.0, steering))

            vmin = self.info.speed_min if self.info else 0.5
            vmax = self.info.speed_max if self.info else 2.8
            throttle = (speed_val - vmin) / max(vmax - vmin, 1e-6)
            throttle = max(0.0, min(1.0, throttle))
            return steering, throttle

    # ------------------------------------------------------------------
    # Private: backend loaders
    # ------------------------------------------------------------------

    def _load_onnx(self, path: Path) -> bool:
        try:
            import openvino as ov
            core = ov.Core()
            model = core.read_model(str(path))
            self._ov_model = core.compile_model(model, "CPU",
                                                config={"PERFORMANCE_HINT": "LATENCY"})
            self._backend = "openvino"
            if self.info:
                self.info.backend = "openvino"
            return True
        except ImportError:
            pass
        except Exception:
            log.debug("OpenVINO failed for %s", path, exc_info=True)

        try:
            import onnxruntime as ort
            self._ort_session = ort.InferenceSession(str(path))
            self._ort_input_name = self._ort_session.get_inputs()[0].name
            self._backend = "onnxruntime"
            if self.info:
                self.info.backend = "onnxruntime"
            return True
        except Exception:
            log.debug("onnxruntime failed for %s", path, exc_info=True)
            return False

    def _try_convert_and_load(self, pb_path: Path, onnx_out: Path) -> bool:
        """Try converting .pb to .onnx using tf2onnx, then load the result."""
        try:
            import tf2onnx  # type: ignore[import-untyped]
            import tensorflow as tf

            log.info("TrackModelAdapter[%s]: converting .pb to .onnx (one-time)...", self.model_id)
            input_names = [_INPUT_TENSOR.rstrip(":0")]
            output_names = [_OUTPUT_TENSOR.rstrip(":0")]

            model_proto, _ = tf2onnx.convert.from_graph_def(
                str(pb_path),
                input_names=[f"{_INPUT_TENSOR}"],
                output_names=[f"{_OUTPUT_TENSOR}"],
                opset=13,
            )
            onnx_out.write_bytes(model_proto.SerializeToString())
            log.info("TrackModelAdapter[%s]: saved converted model to %s", self.model_id, onnx_out)
            return self._load_onnx(onnx_out)
        except ImportError:
            pass
        except Exception:
            log.debug("tf2onnx conversion failed for %s", pb_path, exc_info=True)
        return False

    def _load_tf(self, pb_path: Path) -> bool:
        """Load directly via TensorFlow (tf.compat.v1 frozen graph)."""
        try:
            import tensorflow as tf

            with tf.io.gfile.GFile(str(pb_path), "rb") as f:
                graph_def = tf.compat.v1.GraphDef()
                graph_def.ParseFromString(f.read())

            graph = tf.Graph()
            with graph.as_default():
                tf.import_graph_def(graph_def, name="")

            sess = tf.compat.v1.Session(graph=graph)
            input_name, output_name = self._resolve_tensor_names(graph)
            self._tf_input = graph.get_tensor_by_name(input_name)
            self._tf_output = graph.get_tensor_by_name(output_name)
            self._tf_session = sess
            self._backend = "tensorflow"
            if self.info:
                self.info.backend = "tensorflow"
            return True
        except ImportError:
            pass
        except Exception:
            log.debug("TF load failed for %s", pb_path, exc_info=True)
        return False

    def _resolve_tensor_names(self, graph) -> tuple[str, str]:
        """Find the real input/output tensor names in a DeepRacer frozen graph."""
        try:
            graph.get_tensor_by_name(_INPUT_TENSOR)
            graph.get_tensor_by_name(_OUTPUT_TENSOR)
            return _INPUT_TENSOR, _OUTPUT_TENSOR
        except Exception:
            pass

        input_candidates: list[str] = []
        output_candidates: list[str] = []
        for op in graph.get_operations():
            name = op.name
            if op.type == "Placeholder":
                if "camera" in name.lower() or "observation" in name.lower():
                    input_candidates.append(f"{name}:0")
            if name.lower().endswith("/ppo_head_0/policy") or name.lower().endswith("/policy"):
                output_candidates.append(f"{name}:0")

        if not input_candidates:
            input_candidates = [f"{op.name}:0" for op in graph.get_operations() if op.type == "Placeholder"]
        if not output_candidates:
            output_candidates = [
                f"{op.name}:0"
                for op in graph.get_operations()
                if ("policy" in op.name.lower() or "softmax" in op.name.lower())
            ]

        if not input_candidates or not output_candidates:
            raise KeyError("Unable to resolve DeepRacer graph input/output tensors")
        return input_candidates[0], output_candidates[0]

    def close(self) -> None:
        if self._tf_session is not None:
            try:
                self._tf_session.close()
            except Exception:
                pass
        self._tf_session = None
        self._ort_session = None
        self._ov_model = None
        self._backend = "none"


# ---------------------------------------------------------------------------
# Registry of known track model paths relative to model_registry root
# ---------------------------------------------------------------------------

_REGISTRY_ROOT: Path | None = None


def _find_registry_root() -> Path:
    """Locate the model_registry directory by searching upward."""
    global _REGISTRY_ROOT
    if _REGISTRY_ROOT is not None:
        return _REGISTRY_ROOT
    here = Path(__file__).resolve()
    for parent in [here, *here.parents]:
        candidate = parent / "model_registry"
        if candidate.is_dir():
            _REGISTRY_ROOT = candidate
            return candidate
    _REGISTRY_ROOT = Path("model_registry")
    return _REGISTRY_ROOT


KNOWN_TRACK_MODELS: dict[str, dict[str, str]] = {
    "hybrid-autopilot":     {"label": "Hybrid Autopilot (active model)",   "model_id": ""},
    "hybrid-center-align":  {"label": "Hybrid + Center-Align",             "model_id": "center-align"},
    "hybrid-sdc-navigator": {"label": "Hybrid + WSU Final-Traveller PPO",  "model_id": "sdc-navigator"},
}


def load_adapter_for_variant(variant_id: str, active_model_dir: Path | None = None) -> TrackModelAdapter | None:
    """
    Instantiate and load a TrackModelAdapter for the given explorer variant.
    Returns None if the variant has no associated track model or loading fails.
    """
    root = _find_registry_root()

    model_dirs: dict[str, Path] = {
        "center-align":  root / "models" / "external" / "center-align-continuous",
        "sdc-navigator": root / "models" / "external" / "sdc-navigator",
    }

    if variant_id == "hybrid-autopilot":
        if active_model_dir and (active_model_dir / "agent" / "model.pb").exists():
            candidate = active_model_dir
        else:
            # Fall through to the best available track model
            for mid, path in model_dirs.items():
                if (path / "agent" / "model.pb").exists():
                    candidate = path
                    break
            else:
                return None

        adapter = TrackModelAdapter(candidate, model_id="autopilot", display_name="Autopilot")
        return adapter if adapter.load() else None

    info = KNOWN_TRACK_MODELS.get(variant_id)
    if not info:
        return None

    model_id = info["model_id"]
    path = model_dirs.get(model_id)
    if path is None or not path.exists():
        return None

    adapter = TrackModelAdapter(path, model_id=model_id, display_name=info["label"])
    return adapter if adapter.load() else None
