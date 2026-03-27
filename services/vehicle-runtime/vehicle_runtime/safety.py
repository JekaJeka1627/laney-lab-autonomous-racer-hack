from __future__ import annotations

from dataclasses import dataclass

from vehicle_runtime.actuators import ControlCommand


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


@dataclass
class SafetyPolicy:
    max_throttle: float
    steering_scale: float = 1.0

    def apply(self, steering: float, throttle: float, *, estop: bool) -> ControlCommand:
        if estop:
            return ControlCommand(steering=0.0, throttle=0.0)
        bounded_steering = _clamp(steering * self.steering_scale, -1.0, 1.0)
        bounded_throttle = _clamp(throttle, 0.0, self.max_throttle)
        return ControlCommand(steering=bounded_steering, throttle=bounded_throttle)

