"""
Breadcrumb trail for return-to-home navigation.

Records the car's position at regular intervals during exploration.
To return home, the car follows the breadcrumbs in reverse order.
"""
from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .config import ExplorerConfig

log = logging.getLogger(__name__)


@dataclass
class Breadcrumb:
    """A single position record along the exploration path."""
    x: float
    y: float
    heading: float  # radians
    timestamp: float
    frame_index: int

    def distance_to(self, other_x: float, other_y: float) -> float:
        return math.sqrt((self.x - other_x) ** 2 + (self.y - other_y) ** 2)

    def to_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "heading": self.heading,
            "timestamp": self.timestamp,
            "frame_index": self.frame_index,
        }

    @classmethod
    def from_dict(cls, d: dict) -> Breadcrumb:
        return cls(
            x=d["x"],
            y=d["y"],
            heading=d["heading"],
            timestamp=d["timestamp"],
            frame_index=d["frame_index"],
        )


class BreadcrumbTrail:
    """
    Manages a trail of position breadcrumbs for exploration and return.

    Usage:
        trail = BreadcrumbTrail(config)
        trail.set_home()  # mark starting position

        # During exploration, call every frame:
        trail.maybe_drop(x, y, heading, frame_index)

        # To return home:
        while not trail.is_home(current_x, current_y):
            target = trail.next_return_target()
            # steer toward target
            trail.maybe_pop(current_x, current_y)
    """

    def __init__(self, config: ExplorerConfig):
        self.config = config
        self._crumbs: list[Breadcrumb] = []
        self._home: Breadcrumb | None = None
        self._frames_since_drop: int = 0
        self._return_index: int = -1  # pointer for return navigation

    def set_home(self, x: float = 0.0, y: float = 0.0, heading: float = 0.0) -> None:
        """Mark the current position as home (starting point)."""
        self._home = Breadcrumb(
            x=x, y=y, heading=heading,
            timestamp=time.time(), frame_index=0,
        )
        self._crumbs.clear()
        self._return_index = -1
        log.info("Home position set at (%.2f, %.2f)", x, y)

    @property
    def home(self) -> Breadcrumb | None:
        return self._home

    @property
    def trail_length(self) -> int:
        return len(self._crumbs)

    @property
    def crumbs(self) -> list[Breadcrumb]:
        return list(self._crumbs)

    def maybe_drop(
        self, x: float, y: float, heading: float, frame_index: int
    ) -> bool:
        """
        Drop a breadcrumb if enough frames have passed since the last one.
        Returns True if a crumb was dropped.
        """
        self._frames_since_drop += 1
        if self._frames_since_drop < self.config.breadcrumb_interval_frames:
            return False

        self._frames_since_drop = 0

        # Enforce max trail length (drop oldest if full)
        if len(self._crumbs) >= self.config.max_breadcrumbs:
            self._crumbs.pop(0)

        crumb = Breadcrumb(
            x=x, y=y, heading=heading,
            timestamp=time.time(), frame_index=frame_index,
        )
        self._crumbs.append(crumb)
        return True

    # -- Return-to-home navigation -------------------------------------------

    def start_return(self) -> None:
        """Begin return-to-home by setting the return pointer to the end of the trail."""
        self._return_index = len(self._crumbs) - 1
        log.info("Starting return-to-home with %d breadcrumbs", len(self._crumbs))

    def next_return_target(self) -> Breadcrumb | None:
        """Get the next breadcrumb to navigate toward on the return trip."""
        if self._return_index < 0:
            return self._home  # final target is home itself
        if self._return_index >= len(self._crumbs):
            self._return_index = len(self._crumbs) - 1
        return self._crumbs[self._return_index]

    def maybe_pop(self, current_x: float, current_y: float) -> bool:
        """
        Check if we are close enough to the current return target to advance.
        Returns True if we advanced to the next breadcrumb.
        """
        target = self.next_return_target()
        if target is None:
            return False

        if target.distance_to(current_x, current_y) <= self.config.breadcrumb_reach_radius:
            self._return_index -= 1
            remaining = self._return_index + 1 if self._return_index >= 0 else 0
            log.debug("Reached breadcrumb, %d remaining", remaining)
            return True
        return False

    def is_home(self, current_x: float, current_y: float) -> bool:
        """Check if we have returned to the home position."""
        if self._home is None:
            return False
        return self._home.distance_to(current_x, current_y) <= self.config.breadcrumb_reach_radius

    def is_return_complete(self, current_x: float, current_y: float) -> bool:
        """True when the return pointer is exhausted and we are at home."""
        return self._return_index < 0 and self.is_home(current_x, current_y)

    # -- Steering helper -----------------------------------------------------

    def steering_toward(
        self, target: Breadcrumb, current_x: float, current_y: float, current_heading: float
    ) -> float:
        """
        Compute a steering value [-1, 1] to navigate toward a target breadcrumb.
        """
        dx = target.x - current_x
        dy = target.y - current_y
        target_heading = math.atan2(dy, dx)
        error = _normalize_angle(target_heading - current_heading)
        steering = max(-self.config.max_steering,
                       min(self.config.max_steering,
                           error * self.config.steering_gain))
        return steering

    # -- Persistence ---------------------------------------------------------

    def save(self, path: Path) -> None:
        """Save trail to JSON for multi-session memory."""
        data = {
            "home": self._home.to_dict() if self._home else None,
            "crumbs": [c.to_dict() for c in self._crumbs],
        }
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        log.info("Trail saved to %s (%d crumbs)", path, len(self._crumbs))

    def load(self, path: Path) -> bool:
        """Load trail from JSON. Returns True if successful."""
        if not path.exists():
            return False
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("home"):
                self._home = Breadcrumb.from_dict(data["home"])
            self._crumbs = [Breadcrumb.from_dict(c) for c in data.get("crumbs", [])]
            log.info("Trail loaded from %s (%d crumbs)", path, len(self._crumbs))
            return True
        except Exception:
            log.exception("Failed to load trail from %s", path)
            return False


def _normalize_angle(angle: float) -> float:
    """Normalize angle to [-pi, pi]."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle
