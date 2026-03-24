"""
Swappable driving behavior sub-models for the Visual Explorer.

The DrivingBehavior interface defines HOW the car drives in free space.
The navigation planner decides WHERE to go (frontier, home, etc.) and the
safety layer handles emergency stops.  The driving behavior only controls
steering and throttle when the planner says "go toward this target."

Built-in behaviors:
  ReactiveBehavior      -- proportional steering, fixed throttle (default)
  SmoothPursuitBehavior -- cubic-spline-like smoothing for fluid curves
  SpeedAdaptiveBehavior -- varies throttle based on obstacle proximity
  TrainedModelBehavior  -- runs a trained ONNX model on the camera frame

New behaviors can be added by subclassing DrivingBehavior and registering
them in BEHAVIOR_REGISTRY.
"""
from __future__ import annotations

import logging
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

log = logging.getLogger(__name__)


@dataclass
class BehaviorInput:
    """Everything the driving behavior needs to decide steering/throttle."""
    forward_frame: np.ndarray | None  # camera image (BGR, HxWx3)
    target_x: float                   # where the planner wants us to go
    target_y: float
    car_x: float
    car_y: float
    heading: float                    # radians
    speed: float                      # current speed in ft/s
    sector_scores: tuple[float, float, float]  # obstacle closeness (L, C, R)
    map_explored_pct: float           # how much of the map is known
    is_known_free_space: bool         # map says current area is FREE


@dataclass
class BehaviorOutput:
    """Steering and throttle from the driving behavior."""
    steering: float   # [-1, 1]
    throttle: float   # [0, 1]

    def clamp(self) -> BehaviorOutput:
        return BehaviorOutput(
            steering=max(-1.0, min(1.0, self.steering)),
            throttle=max(0.0, min(1.0, self.throttle)),
        )


class DrivingBehavior(ABC):
    """Base class for all driving behaviors."""

    name: str = "base"
    description: str = "Base driving behavior"

    @abstractmethod
    def compute(self, inp: BehaviorInput) -> BehaviorOutput:
        """Compute steering and throttle for this frame."""
        ...

    def on_activate(self) -> None:
        """Called when this behavior becomes active."""
        pass

    def on_deactivate(self) -> None:
        """Called when switching away from this behavior."""
        pass


# ---------------------------------------------------------------------------
# Built-in behaviors
# ---------------------------------------------------------------------------

class ReactiveBehavior(DrivingBehavior):
    """
    Simple proportional steering toward target with fixed throttle.
    This is the default behavior -- reliable but not fancy.
    """

    name = "reactive"
    description = "Proportional steering, fixed throttle"

    def __init__(self, throttle: float = 0.4, gain: float = 1.2):
        self.throttle = throttle
        self.gain = gain

    def compute(self, inp: BehaviorInput) -> BehaviorOutput:
        dx = inp.target_x - inp.car_x
        dy = inp.target_y - inp.car_y
        target_heading = math.atan2(dy, dx)
        error = _normalize_angle(target_heading - inp.heading)
        steering = max(-1.0, min(1.0, error * self.gain))
        return BehaviorOutput(steering=steering, throttle=self.throttle)


class SmoothPursuitBehavior(DrivingBehavior):
    """
    Smooths steering inputs over time for fluid, natural-looking curves.
    Uses exponential moving average on the steering signal.
    Good for mapped areas where aggressive corrections are unnecessary.
    """

    name = "smooth-pursuit"
    description = "Smoothed steering for fluid curves"

    def __init__(
        self,
        throttle: float = 0.4,
        gain: float = 1.0,
        smoothing: float = 0.7,
    ):
        self.throttle = throttle
        self.gain = gain
        self.smoothing = smoothing  # 0 = no smoothing, 1 = max smoothing
        self._prev_steering: float = 0.0

    def compute(self, inp: BehaviorInput) -> BehaviorOutput:
        dx = inp.target_x - inp.car_x
        dy = inp.target_y - inp.car_y
        target_heading = math.atan2(dy, dx)
        error = _normalize_angle(target_heading - inp.heading)
        raw_steering = max(-1.0, min(1.0, error * self.gain))

        # Exponential moving average
        steering = (
            self.smoothing * self._prev_steering
            + (1 - self.smoothing) * raw_steering
        )
        self._prev_steering = steering

        return BehaviorOutput(steering=steering, throttle=self.throttle)

    def on_activate(self) -> None:
        self._prev_steering = 0.0


class SpeedAdaptiveBehavior(DrivingBehavior):
    """
    Varies throttle based on how open the space ahead is.
    Drives fast in wide-open mapped areas, slows down near obstacles
    or in narrow corridors.
    """

    name = "speed-adaptive"
    description = "Varies speed based on obstacle proximity"

    def __init__(
        self,
        max_throttle: float = 0.6,
        min_throttle: float = 0.2,
        gain: float = 1.2,
    ):
        self.max_throttle = max_throttle
        self.min_throttle = min_throttle
        self.gain = gain

    def compute(self, inp: BehaviorInput) -> BehaviorOutput:
        dx = inp.target_x - inp.car_x
        dy = inp.target_y - inp.car_y
        target_heading = math.atan2(dy, dx)
        error = _normalize_angle(target_heading - inp.heading)
        steering = max(-1.0, min(1.0, error * self.gain))

        # Throttle based on center obstacle closeness
        center_closeness = inp.sector_scores[1]
        # 0 closeness = full speed, 0.7+ = min speed
        openness = max(0.0, 1.0 - center_closeness / 0.7)

        # Boost in known free space
        if inp.is_known_free_space:
            openness = min(1.0, openness + 0.2)

        throttle = self.min_throttle + openness * (self.max_throttle - self.min_throttle)

        # Reduce throttle when turning hard
        turn_penalty = abs(steering) * 0.3
        throttle = max(self.min_throttle, throttle - turn_penalty)

        return BehaviorOutput(steering=steering, throttle=throttle)


class TrainedModelBehavior(DrivingBehavior):
    """
    Runs a trained ONNX model on the camera frame to predict steering.
    Throttle comes from the speed-adaptive logic so the trained model
    only needs to output steering.

    The model should accept a (1, 3, 120, 160) float32 input (CHW, normalized)
    and output a single float in [-1, 1].

    Inference backend priority (same rationale as obstacle_detector.py):
      1. OpenVINO  -- preferred on the DeepRacer's Intel Atom CPU.
         The steering model is small (< 5MB) so inference is already fast,
         but OpenVINO still helps because it fuses the Conv+BN+ReLU layers
         and uses vectorized Intel SIMD instructions.  This reduces per-frame
         latency from ~3ms (onnxruntime) to ~1-2ms (OpenVINO), which matters
         when the model runs inside the main 10 FPS control loop alongside
         MiDaS depth and stereo matching.
      2. onnxruntime -- fallback if OpenVINO is not installed.
    """

    name = "trained-model"
    description = "ONNX model predicts steering from camera (OpenVINO accelerated)"

    def __init__(
        self,
        model_path: str = "",
        throttle: float = 0.35,
        blend_ratio: float = 0.5,
    ):
        self.model_path = model_path
        self.throttle = throttle
        self.blend_ratio = blend_ratio  # blend model steering with reactive
        self._backend: str = "none"
        self._ov_model = None       # OpenVINO compiled model
        self._ort_session = None     # onnxruntime session (fallback)
        self._ort_input_name: str = ""
        self._reactive = ReactiveBehavior(throttle=throttle)

    def on_activate(self) -> None:
        if not self.model_path:
            log.warning("TrainedModelBehavior: no model path set, falling back to reactive")
            return

        # Try OpenVINO first -- same .onnx file, faster on Intel.
        # OpenVINO compiles the steering CNN into an Intel-optimized graph
        # at load time, so every subsequent inference call is faster.
        try:
            import openvino as ov
            core = ov.Core()
            model = core.read_model(self.model_path)
            # LATENCY hint tells OpenVINO to optimize for single-frame
            # inference speed rather than throughput (batched).
            compiled = core.compile_model(
                model, "CPU",
                config={"PERFORMANCE_HINT": "LATENCY"},
            )
            self._ov_model = compiled
            self._backend = "openvino"
            log.info("Driving model loaded via OpenVINO (Intel-optimized): %s",
                     self.model_path)
            return
        except ImportError:
            pass  # OpenVINO not installed
        except Exception:
            log.warning("OpenVINO failed to load driving model, trying onnxruntime",
                        exc_info=True)

        # Fallback: onnxruntime -- works on any CPU but without
        # Intel-specific graph fusion and SIMD optimizations.
        try:
            import onnxruntime as ort
            self._ort_session = ort.InferenceSession(self.model_path)
            self._ort_input_name = self._ort_session.get_inputs()[0].name
            self._backend = "onnxruntime"
            log.info("Driving model loaded via onnxruntime (generic CPU): %s",
                     self.model_path)
            log.info("TIP: Install openvino for faster steering inference: "
                     "pip install openvino")
        except Exception:
            log.exception("Failed to load driving model: %s", self.model_path)
            self._backend = "none"

    def on_deactivate(self) -> None:
        self._ov_model = None
        self._ort_session = None
        self._backend = "none"

    def compute(self, inp: BehaviorInput) -> BehaviorOutput:
        # Fall back to reactive if model not loaded or no frame
        if self._backend == "none" or inp.forward_frame is None:
            return self._reactive.compute(inp)

        try:
            # Preprocess frame: resize to 160x120, normalize, CHW
            import cv2
            frame = cv2.resize(inp.forward_frame, (160, 120))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            arr = frame.astype(np.float32) / 255.0
            chw = np.transpose(arr, (2, 0, 1))
            batch = np.expand_dims(chw, axis=0)

            # Run inference on the preferred backend.
            # Both paths produce the same steering prediction; OpenVINO
            # is just faster on the DeepRacer's Intel Atom.
            if self._backend == "openvino":
                result = self._ov_model(batch)  # type: ignore[misc]
                model_steering = float(
                    result[self._ov_model.output(0)].flat[0]  # type: ignore[misc]
                )
            else:
                result = self._ort_session.run(  # type: ignore[union-attr]
                    None, {self._ort_input_name: batch},
                )
                model_steering = float(result[0].flat[0])

            model_steering = max(-1.0, min(1.0, model_steering))

            # Blend with reactive steering for safety.
            # At blend_ratio=0.5, the final steering is 50% model + 50%
            # proportional-to-target.  This prevents the trained model from
            # making dangerous decisions in unfamiliar environments.
            reactive_output = self._reactive.compute(inp)
            blended = (
                self.blend_ratio * model_steering
                + (1 - self.blend_ratio) * reactive_output.steering
            )

            return BehaviorOutput(
                steering=max(-1.0, min(1.0, blended)),
                throttle=self.throttle,
            )
        except Exception:
            log.debug("Model inference failed, falling back to reactive", exc_info=True)
            return self._reactive.compute(inp)


class DeepRacerHybridBehavior(DrivingBehavior):
    """
    Hybrid autopilot: borrows steering from a DeepRacer track model while
    the explorer handles obstacle avoidance and navigation.

    Blend logic:
      - Center clear:   trust track model heavily (blend_clear)
      - Center caution: mix track + reactive (blend_caution)
      - Center blocked: ignore track model, full reactive avoidance

    This gives smooth, trained driving in open space while still reacting
    to obstacles that the track model was never trained to handle.
    """

    name = "deepracer-hybrid"
    description = "Track model steering + explorer obstacle avoidance"

    def __init__(
        self,
        variant_id: str = "hybrid-autopilot",
        blend_clear: float = 0.72,
        blend_caution: float = 0.35,
        caution_threshold: float = 0.5,
        blocked_threshold: float = 0.75,
        throttle: float = 0.4,
    ):
        self.variant_id = variant_id
        self.blend_clear = blend_clear
        self.blend_caution = blend_caution
        self.caution_threshold = caution_threshold
        self.blocked_threshold = blocked_threshold
        self.throttle = throttle
        self._adapter = None
        self._reactive = SpeedAdaptiveBehavior(max_throttle=throttle, min_throttle=0.2)

    def on_activate(self) -> None:
        from .track_model_adapter import load_adapter_for_variant
        self._adapter = load_adapter_for_variant(self.variant_id)
        if self._adapter is not None:
            log.info(
                "DeepRacerHybridBehavior[%s]: track model loaded (backend=%s)",
                self.variant_id,
                self._adapter.info.backend if self._adapter.info else "?",
            )
        else:
            log.warning(
                "DeepRacerHybridBehavior[%s]: track model unavailable, "
                "running as pure speed-adaptive explorer",
                self.variant_id,
            )

    def on_deactivate(self) -> None:
        if self._adapter is not None:
            self._adapter.close()
            self._adapter = None

    def compute(self, inp: BehaviorInput) -> BehaviorOutput:
        # Always compute the explorer's own reactive output for blending/fallback
        reactive_out = self._reactive.compute(inp)

        # No frame or no model loaded: pure explorer
        if self._adapter is None or inp.forward_frame is None:
            return reactive_out

        # Run track model
        prediction = self._adapter.predict(inp.forward_frame)
        if prediction is None:
            return reactive_out

        track_steering, track_throttle = prediction

        # Determine blend ratio from center obstacle closeness
        center_closeness = inp.sector_scores[1]

        if center_closeness >= self.blocked_threshold:
            # Full avoidance -- ignore track model entirely
            return reactive_out

        if center_closeness >= self.caution_threshold:
            blend = self.blend_caution
        else:
            blend = self.blend_clear

        # Also reduce trust if the track model wants to steer INTO an obstacle
        left_blocked  = inp.sector_scores[0] >= self.caution_threshold
        right_blocked = inp.sector_scores[2] >= self.caution_threshold
        if (track_steering < -0.3 and left_blocked) or (track_steering > 0.3 and right_blocked):
            blend = max(0.0, blend - 0.4)

        steering = blend * track_steering + (1 - blend) * reactive_out.steering
        steering = max(-1.0, min(1.0, steering))

        # Throttle: track model suggests speed, explorer modulates for obstacles
        throttle = blend * track_throttle + (1 - blend) * reactive_out.throttle
        throttle = max(0.0, min(1.0, throttle))

        return BehaviorOutput(steering=steering, throttle=throttle)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

BEHAVIOR_REGISTRY: dict[str, type[DrivingBehavior]] = {
    "reactive": ReactiveBehavior,
    "smooth-pursuit": SmoothPursuitBehavior,
    "speed-adaptive": SpeedAdaptiveBehavior,
    "trained-model": TrainedModelBehavior,
    "deepracer-hybrid": DeepRacerHybridBehavior,
}


def list_behaviors() -> list[dict[str, str]]:
    """Return metadata for all registered behaviors."""
    return [
        {"id": cls.name, "description": cls.description}
        for cls in BEHAVIOR_REGISTRY.values()
    ]


def create_behavior(behavior_id: str, **kwargs) -> DrivingBehavior:
    """Instantiate a behavior by ID."""
    cls = BEHAVIOR_REGISTRY.get(behavior_id)
    if cls is None:
        log.warning("Unknown behavior '%s', falling back to reactive", behavior_id)
        cls = ReactiveBehavior
    return cls(**kwargs)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_angle(angle: float) -> float:
    """Normalize angle to [-pi, pi]."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle
