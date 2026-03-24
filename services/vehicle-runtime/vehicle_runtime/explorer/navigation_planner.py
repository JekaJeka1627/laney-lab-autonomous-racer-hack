"""
Navigation planner for the Visual Explorer.

Three modes:
  EXPLORING  -- drive forward, avoid obstacles, prefer unvisited areas
  RETURNING  -- follow breadcrumb trail back to home
  SAFETY     -- emergency stop or stuck recovery

The planner takes obstacle readings, odometry state, and landmark memory
as inputs and outputs a steering + throttle action.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from enum import Enum, auto

import math

import numpy as np

from .breadcrumb_trail import BreadcrumbTrail, Breadcrumb
from .config import ExplorerConfig
from .driving_behavior import (
    BehaviorInput,
    DrivingBehavior,
    ReactiveBehavior,
    create_behavior,
)
from .landmark_db import LandmarkDatabase
from .obstacle_detector import ObstacleReading, SectorStatus

log = logging.getLogger(__name__)


class ExplorerMode(Enum):
    EXPLORING = auto()
    RETURNING = auto()
    SAFETY = auto()
    HOME = auto()


@dataclass
class Action:
    """Steering and throttle command for the vehicle."""
    steering: float  # [-1, 1], negative = left, positive = right
    throttle: float  # [0, 1]

    def clamp(self) -> Action:
        return Action(
            steering=max(-1.0, min(1.0, self.steering)),
            throttle=max(0.0, min(1.0, self.throttle)),
        )


@dataclass
class OdometryState:
    """Current estimated position and heading from visual odometry or dead reckoning."""
    x: float = 0.0
    y: float = 0.0
    heading: float = 0.0  # radians
    speed: float = 0.0


class NavigationPlanner:
    """
    Decides what the car should do each frame.

    Usage:
        planner = NavigationPlanner(config, trail, landmarks, world_map)
        action = planner.plan(obstacles, odometry)
        # send action.steering and action.throttle to servos
    """

    def __init__(
        self,
        config: ExplorerConfig,
        trail: BreadcrumbTrail,
        landmarks: LandmarkDatabase,
        world_map: object | None = None,
    ):
        self.config = config
        self.trail = trail
        self.landmarks = landmarks
        self.world_map = world_map  # OccupancyMap (optional, avoids circular import)

        self.mode = ExplorerMode.EXPLORING
        self._explore_start_time: float = 0.0
        self._last_progress_time: float = 0.0
        self._last_position: tuple[float, float] = (0.0, 0.0)
        self._frontier_target: tuple[float, float] | None = None

        # Swappable driving behavior (controls free-space driving style)
        self._behavior: DrivingBehavior = ReactiveBehavior(
            throttle=config.explore_throttle,
        )
        self._forward_frame: np.ndarray | None = None  # set each frame by runtime

    @property
    def active_behavior(self) -> str:
        """ID of the currently active driving behavior."""
        return self._behavior.name

    def set_behavior(self, behavior_id_or_instance, **kwargs) -> str:
        """
        Switch to a different driving behavior.
        Accepts either a behavior ID string or a pre-constructed DrivingBehavior instance.
        Returns the name of the newly active behavior.
        """
        self._behavior.on_deactivate()
        if isinstance(behavior_id_or_instance, str):
            self._behavior = create_behavior(behavior_id_or_instance, **kwargs)
            self._behavior.on_activate()
        else:
            self._behavior = behavior_id_or_instance
            # Caller is responsible for calling on_activate before passing
        log.info("Driving behavior switched to: %s", self._behavior.name)
        return self._behavior.name

    def set_frame(self, frame: np.ndarray | None) -> None:
        """Provide the current camera frame for trained-model behaviors."""
        self._forward_frame = frame

    def start_exploring(self) -> None:
        """Begin exploration from current position."""
        self.mode = ExplorerMode.EXPLORING
        self._explore_start_time = time.time()
        self._last_progress_time = time.time()
        log.info("Explorer mode: EXPLORING")

    def start_returning(self) -> None:
        """Switch to return-to-home mode."""
        self.mode = ExplorerMode.RETURNING
        self.trail.start_return()
        log.info("Explorer mode: RETURNING (%d breadcrumbs to follow)", self.trail.trail_length)

    def plan(self, obstacles: ObstacleReading, odom: OdometryState) -> Action:
        """Compute the next steering/throttle action based on current state."""
        # Safety checks first (apply in all modes)
        if self._check_emergency_stop(obstacles):
            return Action(steering=0.0, throttle=0.0)

        if self.mode == ExplorerMode.EXPLORING:
            action = self._plan_explore(obstacles, odom)
            self._check_auto_return(odom)
            return action.clamp()

        elif self.mode == ExplorerMode.RETURNING:
            action = self._plan_return(obstacles, odom)
            if self.trail.is_return_complete(odom.x, odom.y):
                self.mode = ExplorerMode.HOME
                log.info("Explorer mode: HOME -- exploration complete")
                return Action(steering=0.0, throttle=0.0)
            return action.clamp()

        elif self.mode == ExplorerMode.HOME:
            return Action(steering=0.0, throttle=0.0)

        else:  # SAFETY
            return self._plan_safety(obstacles, odom).clamp()

    def _plan_explore(self, obs: ObstacleReading, odom: OdometryState) -> Action:
        """Exploration: drive forward, avoid obstacles, prefer new areas."""
        # Track progress for stuck detection
        dist_from_last = (
            (odom.x - self._last_position[0]) ** 2 +
            (odom.y - self._last_position[1]) ** 2
        ) ** 0.5
        if dist_from_last > 0.3:
            self._last_progress_time = time.time()
            self._last_position = (odom.x, odom.y)

        # Check if stuck
        if time.time() - self._last_progress_time > self.config.stuck_timeout_seconds:
            log.warning("Stuck detected -- attempting recovery turn")
            self._last_progress_time = time.time()
            return Action(steering=0.8, throttle=self.config.avoid_throttle)

        # Determine target point (frontier or fallback)
        frontier = self._frontier_target
        if frontier is None:
            # Default: a point straight ahead
            frontier = (
                odom.x + 5.0 * math.cos(odom.heading),
                odom.y + 5.0 * math.sin(odom.heading),
            )

        # Check if current position is in known free space on the map
        is_known_free = False
        map_explored_pct = 0.0
        if self.world_map is not None:
            is_known_free = self.world_map.is_free(odom.x, odom.y)  # type: ignore[union-attr]
            map_explored_pct = self.world_map.stats.get("explored_pct", 0)  # type: ignore[union-attr]

        # Build behavior input
        behavior_input = BehaviorInput(
            forward_frame=self._forward_frame,
            target_x=frontier[0],
            target_y=frontier[1],
            car_x=odom.x,
            car_y=odom.y,
            heading=odom.heading,
            speed=odom.speed,
            sector_scores=obs.sector_scores,
            map_explored_pct=map_explored_pct,
            is_known_free_space=is_known_free,
        )

        # Path is clear ahead -- delegate to the active driving behavior
        if obs.center == SectorStatus.CLEAR:
            # Re-acquire frontier target periodically
            self._update_frontier_target(odom)

            result = self._behavior.compute(behavior_input)
            return Action(steering=result.steering, throttle=result.throttle)

        # Obstacle ahead -- safety layer overrides the behavior
        if obs.left == SectorStatus.CLEAR and obs.right != SectorStatus.CLEAR:
            return Action(steering=-0.5, throttle=self.config.avoid_throttle)
        elif obs.right == SectorStatus.CLEAR and obs.left != SectorStatus.CLEAR:
            return Action(steering=0.5, throttle=self.config.avoid_throttle)
        elif obs.left == SectorStatus.CLEAR and obs.right == SectorStatus.CLEAR:
            # Both sides clear -- let behavior pick, but at reduced speed
            result = self._behavior.compute(behavior_input)
            steering = result.steering if abs(result.steering) > 0.1 else -0.3
            return Action(steering=steering, throttle=self.config.avoid_throttle)
        else:
            # Everything is blocked -- hard turn (safety override)
            return Action(steering=obs.escape_steering(), throttle=self.config.avoid_throttle)

    def _plan_return(self, obs: ObstacleReading, odom: OdometryState) -> Action:
        """Return-to-home: follow breadcrumbs in reverse, still avoiding obstacles."""
        # Pop breadcrumbs as we reach them
        self.trail.maybe_pop(odom.x, odom.y)

        target = self.trail.next_return_target()
        if target is None:
            return Action(steering=0.0, throttle=0.0)

        # Compute steering toward target breadcrumb
        steering = self.trail.steering_toward(target, odom.x, odom.y, odom.heading)
        throttle = self.config.return_throttle

        # Override if obstacle is in the way
        if obs.center == SectorStatus.BLOCKED:
            steering = obs.escape_steering()
            throttle = self.config.avoid_throttle
        elif obs.center == SectorStatus.CAUTION:
            throttle = self.config.avoid_throttle

        return Action(steering=steering, throttle=throttle)

    def _plan_safety(self, obs: ObstacleReading, odom: OdometryState) -> Action:
        """Safety mode: try to get unstuck."""
        if obs.all_clear:
            self.mode = ExplorerMode.EXPLORING
            log.info("Safety cleared -- resuming exploration")
            return Action(steering=0.0, throttle=self.config.explore_throttle)

        return Action(steering=obs.escape_steering(), throttle=self.config.avoid_throttle)

    def _check_emergency_stop(self, obs: ObstacleReading) -> bool:
        """Check if an emergency stop is needed."""
        l, c, r = obs.sector_scores
        if c >= self.config.emergency_stop_threshold:
            if self.mode != ExplorerMode.SAFETY:
                log.warning("Emergency stop: obstacle very close (center=%.2f)", c)
                self.mode = ExplorerMode.SAFETY
            return True
        return False

    def _check_auto_return(self, odom: OdometryState) -> None:
        """Auto-trigger return-to-home after max exploration time."""
        elapsed = time.time() - self._explore_start_time
        if elapsed >= self.config.max_explore_seconds:
            log.info("Max exploration time reached (%.0fs) -- returning home", elapsed)
            self.start_returning()

    def _update_frontier_target(self, odom: OdometryState) -> None:
        """
        Refresh the frontier target from the occupancy map.
        Prioritizes low-confidence areas for re-exploration.
        Called periodically, not every frame.
        """
        if self.world_map is None:
            return

        elapsed = time.time() - getattr(self, '_frontier_check_time', 0.0)
        if self._frontier_target is not None and elapsed < 3.0:
            return  # reuse existing target for a few seconds

        # First, check if there are pre-mapping hints to follow
        if hasattr(self, '_premap_hints') and self._premap_hints:
            import math
            # Prioritize high-priority hints
            high_priority_hints = [h for h in self._premap_hints if h.get("priority") == "high"]
            if high_priority_hints:
                # Find nearest high-priority hint
                nearest_hint = None
                nearest_dist = float('inf')
                
                for hint in high_priority_hints:
                    pos = hint.get("position", (0, 0))
                    dist = math.sqrt((pos[0] - odom.x)**2 + (pos[1] - odom.y)**2)
                    if dist < nearest_dist:
                        nearest_dist = dist
                        nearest_hint = pos
                
                if nearest_hint and nearest_dist < 40.0:  # 40 feet max for pre-mapping hints
                    self._frontier_target = nearest_hint
                    self._frontier_check_time = time.time()
                    log.debug("Targeting pre-mapping hint at (%.1f, %.1f)", *nearest_hint)
                    return
        
        # Then check if there are low-confidence areas to revisit
        low_conf_areas = self.world_map.get_low_confidence_areas(max_results=5)  # type: ignore[union-attr]
        
        if low_conf_areas:
            # Pick the nearest low-confidence area
            nearest_area = None
            nearest_dist = float('inf')
            
            for x, y, conf in low_conf_areas:
                dist = math.sqrt((x - odom.x)**2 + (y - odom.y)**2)
                if dist < nearest_dist:
                    nearest_dist = dist
                    nearest_area = (x, y)
            
            # If low-confidence area is within reasonable range, target it
            if nearest_area and nearest_dist < 30.0:  # 30 feet max for re-exploration
                self._frontier_target = nearest_area
                self._frontier_check_time = time.time()
                log.debug("Targeting low-confidence area at (%.1f, %.1f)", *nearest_area)
                return
        
        # Otherwise, find normal frontier (unexplored area)
        target = self.world_map.nearest_frontier(odom.x, odom.y)  # type: ignore[union-attr]
        self._frontier_target = target
        self._frontier_check_time = time.time()


def _normalize_angle(angle: float) -> float:
    """Normalize angle to [-pi, pi]."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle
