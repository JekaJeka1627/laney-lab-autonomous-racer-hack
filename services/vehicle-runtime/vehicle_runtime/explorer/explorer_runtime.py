"""
Main runtime loop for the Visual Explorer.

Captures camera frames, runs obstacle detection, updates odometry and
landmarks, and commands steering/throttle through the navigation planner.

This module ties all explorer components together into a single run loop
that can be started from the vehicle runtime or run standalone for testing.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path

import cv2
import numpy as np

from .breadcrumb_trail import BreadcrumbTrail
from .config import ExplorerConfig, ExplorerVariant
from .landmark_db import LandmarkDatabase
from .navigation_planner import Action, ExplorerMode, NavigationPlanner, OdometryState
from .driving_behavior import (
    DeepRacerHybridBehavior,
    SpeedAdaptiveBehavior,
    list_behaviors,
)
from .obstacle_detector import ObstacleDetector
from .occupancy_map import OccupancyMap

log = logging.getLogger(__name__)


class ExplorerRuntime:
    """
    Visual Explorer main runtime.

    Manages camera capture, obstacle detection, navigation planning,
    breadcrumb recording, and landmark storage. Outputs steering/throttle
    commands each frame.

    Usage:
        runtime = ExplorerRuntime()
        runtime.start()
        try:
            while runtime.running:
                action = runtime.step()
                # send action.steering, action.throttle to servos
        finally:
            runtime.stop()
    """

    def __init__(self, config: ExplorerConfig | None = None):
        self.config = config or ExplorerConfig()
        self.obstacle_detector = ObstacleDetector(self.config)
        self.trail = BreadcrumbTrail(self.config)
        self.landmarks = LandmarkDatabase(self.config)
        self.world_map = OccupancyMap()
        self.planner = NavigationPlanner(
            self.config, self.trail, self.landmarks, self.world_map,
        )
        self.odometry = OdometryState()

        self._front_cam: cv2.VideoCapture | None = None
        self._usb_cam: cv2.VideoCapture | None = None
        self._usb_cam_available: bool = False
        self._frame_index: int = 0
        self._running: bool = False
        self._last_frame_time: float = 0.0
        self._distance_traveled_ft: float = 0.0
        self._last_action: Action = Action(steering=0.0, throttle=0.0)

        # Dead reckoning speed calibration (feet per second at throttle=1.0)
        self._speed_ft_per_sec: float = config.speed_ft_per_sec_at_full_throttle if config else 6.5

    @property
    def running(self) -> bool:
        return self._running

    @property
    def mode(self) -> ExplorerMode:
        return self.planner.mode

    @property
    def distance_traveled_ft(self) -> float:
        return self._distance_traveled_ft

    @property
    def usb_camera_active(self) -> bool:
        return self._usb_cam_available

    @property
    def last_action(self) -> Action:
        return self._last_action

    def set_variant(self, variant_id: str) -> dict:
        """
        Switch the explorer variant (pure / hybrid-autopilot / hybrid-center-align / ...).
        Can be called while the explorer is stopped or running.
        Returns a summary dict with status and loaded backend info.
        """
        try:
            variant = ExplorerVariant(variant_id)
        except ValueError:
            return {"ok": False, "error": f"Unknown variant '{variant_id}'"}

        self.config.variant = variant

        if variant.is_hybrid:
            behavior = DeepRacerHybridBehavior(
                variant_id=variant.value,
                throttle=self.config.explore_throttle,
            )
        else:
            behavior = SpeedAdaptiveBehavior(
                max_throttle=self.config.explore_throttle,
                min_throttle=self.config.avoid_throttle,
            )

        # Activate the new behavior (loads track model if needed)
        if hasattr(self.planner, "active_behavior") and self.planner.active_behavior:
            try:
                from .driving_behavior import BEHAVIOR_REGISTRY
                old = BEHAVIOR_REGISTRY.get(self.planner.active_behavior)
                if old:
                    pass  # on_deactivate handled inside DeepRacerHybridBehavior
            except Exception:
                pass

        behavior.on_activate()
        self.planner.set_behavior(behavior)

        backend = "none"
        if isinstance(behavior, DeepRacerHybridBehavior) and behavior._adapter:
            backend = behavior._adapter.info.backend if behavior._adapter.info else "loaded"

        log.info("Explorer variant set to '%s' (backend=%s)", variant.value, backend)
        return {
            "ok": True,
            "variant": variant.value,
            "label": variant.label,
            "backend": backend,
            "track_model_loaded": backend != "none",
        }

    @property
    def status_dict(self) -> dict:
        """Return a status snapshot for the dashboard."""
        mode_name = self.planner.mode.name if self._running else "STOPPED"
        return {
            "mode": mode_name,
            "running": self._running,
            "variant": self.config.variant.value,
            "variant_label": self.config.variant.label,
            "distance_ft": round(self._distance_traveled_ft, 1),
            "breadcrumbs": self.trail.trail_length,
            "landmarks": self.landmarks.count,
            "frames": self._frame_index,
            "position": (round(self.odometry.x, 2), round(self.odometry.y, 2)),
            "heading_deg": round(self.odometry.heading * 180 / 3.14159, 1),
            "usb_camera": self._usb_cam_available,
            "stereo_depth": self._usb_cam_available,
            "map": self.world_map.stats,
            "map_time": self.world_map.last_update_time,
            "behavior": self.planner.active_behavior,
            "steering": round(self._last_action.steering, 2),
            "throttle": round(self._last_action.throttle, 2),
        }

    def start(self) -> bool:
        """
        Initialize cameras, load models, set home position.
        Returns True if ready to explore.
        """
        log.info("Starting Visual Explorer runtime")

        # Load obstacle detection model
        depth_ok = self.obstacle_detector.load()
        if not depth_ok:
            log.warning("Obstacle detection unavailable -- running in blind mode")

        # Open front camera
        self._front_cam = cv2.VideoCapture(self.config.front_camera_index)
        if not self._front_cam.isOpened():
            log.error("Failed to open front camera (index %d)", self.config.front_camera_index)
            return False
        self._front_cam.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.frame_width)
        self._front_cam.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.frame_height)
        log.info("Front camera opened (index %d)", self.config.front_camera_index)

        # Auto-detect USB camera
        self._usb_cam, self._usb_cam_available = self._open_usb_camera()

        # Set home and start exploring
        self.trail.set_home(0.0, 0.0, 0.0)
        self.odometry = OdometryState(x=0.0, y=0.0, heading=0.0, speed=0.0)
        self._distance_traveled_ft = 0.0
        
        # Load pre-mapping hints if available
        self._load_premap_hints()
        
        self.planner.start_exploring()

        self._running = True
        self._last_frame_time = time.time()
        log.info("Visual Explorer ready -- exploring from home (0, 0)%s",
                 " [USB camera active]" if self._usb_cam_available else "")
        return True

    def step(self) -> Action:
        """
        Run one frame of the explorer loop.
        Returns the steering/throttle action for this frame.
        """
        if not self._running:
            return Action(steering=0.0, throttle=0.0)

        # Rate limiting
        now = time.time()
        target_dt = 1.0 / self.config.target_fps
        elapsed = now - self._last_frame_time
        if elapsed < target_dt:
            time.sleep(target_dt - elapsed)
            now = time.time()
        dt = now - self._last_frame_time
        self._last_frame_time = now

        # Capture forward-facing cameras (car always drives forward, turns
        # around before returning -- so both cameras always face forward)
        forward_frame = self._capture_front()
        usb_frame = self._capture_usb()

        if forward_frame is None:
            log.warning("Forward camera frame capture failed")
            return Action(steering=0.0, throttle=0.0)

        # Primary obstacle detection from built-in camera
        obstacles = self.obstacle_detector.detect(forward_frame)

        # If USB camera is available, use it for stereo depth enhancement.
        # Two forward-facing cameras with a known baseline give real metric
        # distances instead of MiDaS relative depth.
        if usb_frame is not None:
            self.obstacle_detector.enhance_with_stereo(forward_frame, usb_frame)

        # Update dead reckoning odometry (placeholder for visual odometry)
        # TODO: Replace with ORB-based visual odometry in Phase 3
        self._update_dead_reckoning(dt)

        # Track total distance traveled
        self._distance_traveled_ft += abs(self.odometry.speed * dt)

        # Update occupancy map from position and depth
        self.world_map.update_from_position(self.odometry.x, self.odometry.y)
        self.world_map.update_from_depth(
            self.odometry.x, self.odometry.y, self.odometry.heading,
            obstacles.sector_scores,
        )

        # Check distance limit
        if (self.config.max_explore_distance_ft > 0
                and self.planner.mode == ExplorerMode.EXPLORING
                and self._distance_traveled_ft >= self.config.max_explore_distance_ft):
            log.info("Distance limit reached (%.1f ft) -- returning home",
                     self._distance_traveled_ft)
            self.planner.start_returning()

        # Drop breadcrumbs during exploration
        if self.planner.mode == ExplorerMode.EXPLORING:
            self.trail.maybe_drop(
                self.odometry.x, self.odometry.y,
                self.odometry.heading, self._frame_index,
            )
            # Save visual landmarks from the forward-facing camera (Phase 2)
            self.landmarks.maybe_save(
                forward_frame, self.odometry.x, self.odometry.y,
                self.odometry.heading, self._frame_index,
            )

        # Pass frame to planner for trained-model behaviors
        self.planner.set_frame(forward_frame)

        # Plan next action
        action = self.planner.plan(obstacles, self.odometry)

        # Update speed estimate from the action we are about to take (in ft/s)
        self.odometry.speed = action.throttle * self._speed_ft_per_sec

        self._last_action = action
        self._frame_index += 1
        return action

    def trigger_return(self) -> None:
        """Manually trigger return-to-home."""
        if self.planner.mode == ExplorerMode.EXPLORING:
            self.planner.start_returning()
        else:
            log.warning("Cannot return -- current mode is %s", self.planner.mode.name)

    def stop(self) -> None:
        """Release cameras and save state."""
        self._running = False
        if self._front_cam is not None:
            self._front_cam.release()
            self._front_cam = None
        if self._usb_cam is not None:
            self._usb_cam.release()
            self._usb_cam = None
        map_stats = self.world_map.stats
        log.info("Visual Explorer stopped (explored %d frames, %d breadcrumbs, "
                 "%d landmarks, map %.1f%% explored)",
                 self._frame_index, self.trail.trail_length,
                 self.landmarks.count, map_stats["explored_pct"])

    def save_state(self, directory: Path) -> None:
        """Save trail, map, and landmark data for resuming later."""
        directory.mkdir(parents=True, exist_ok=True)
        self.trail.save(directory / "trail.json")
        self.world_map.save(directory / "map.npz")
        log.info("Explorer state saved to %s", directory)

    def load_state(self, directory: Path) -> bool:
        """Load previously saved trail and map data."""
        trail_ok = self.trail.load(directory / "trail.json")
        map_ok = self.world_map.load(directory / "map.npz")
        if map_ok:
            log.info("Loaded saved map: %.1f%% already explored",
                     self.world_map.stats["explored_pct"])
        return trail_ok or map_ok

    def set_distance_limit(self, feet: float) -> None:
        """Set or update the maximum exploration distance in feet."""
        self.config.max_explore_distance_ft = feet
        log.info("Distance limit set to %.1f ft", feet)

    def set_time_limit(self, seconds: float) -> None:
        """Set or update the maximum exploration time in seconds."""
        self.config.max_explore_seconds = seconds
        log.info("Time limit set to %.0f seconds", seconds)

    def set_behavior(self, behavior_id: str, **kwargs) -> str:
        """Switch the driving behavior sub-model. Returns the new behavior name."""
        return self.planner.set_behavior(behavior_id, **kwargs)

    def get_available_behaviors(self) -> list[dict[str, str]]:
        """List all registered driving behaviors."""
        return list_behaviors()

    # -- Internal helpers ----------------------------------------------------

    def _open_usb_camera(self) -> tuple[cv2.VideoCapture | None, bool]:
        """
        Auto-detect and open the USB camera.

        If usb_camera_index >= 0, try that specific index.
        If usb_camera_auto_detect is True and index is -1, scan available
        camera indices to find one that is not the front camera.

        Returns (capture, is_available).
        """
        # Explicit index
        if self.config.usb_camera_index >= 0:
            cam = cv2.VideoCapture(self.config.usb_camera_index)
            if cam.isOpened():
                cam.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.frame_width)
                cam.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.frame_height)
                log.info("USB camera opened at index %d (role: %s)",
                         self.config.usb_camera_index, self.config.usb_camera_role)
                return cam, True
            log.warning("USB camera not found at index %d", self.config.usb_camera_index)
            return None, False

        # Auto-detect: scan indices, skip the front camera index
        if not self.config.usb_camera_auto_detect:
            return None, False

        for idx in range(self.config.usb_camera_max_scan):
            if idx == self.config.front_camera_index:
                continue
            cam = cv2.VideoCapture(idx)
            if cam.isOpened():
                cam.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.frame_width)
                cam.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.frame_height)
                log.info("USB camera auto-detected at index %d (role: %s)",
                         idx, self.config.usb_camera_role)
                return cam, True
            cam.release()

        log.info("No USB camera detected -- running with front camera only")
        return None, False

    def _capture_front(self) -> np.ndarray | None:
        """Capture a frame from the front camera."""
        if self._front_cam is None or not self._front_cam.isOpened():
            return None
        ret, frame = self._front_cam.read()
        return frame if ret else None

    def _capture_usb(self) -> np.ndarray | None:
        """Capture a frame from the USB camera (if available)."""
        if self._usb_cam is None or not self._usb_cam.isOpened():
            return None
        ret, frame = self._usb_cam.read()
        return frame if ret else None

    def _update_dead_reckoning(self, dt: float) -> None:
        """
        Simple dead reckoning: integrate speed along heading.
        This is a rough estimate. Phase 3 replaces this with visual odometry.
        """
        import math
        distance = self.odometry.speed * dt
        self.odometry.x += distance * math.cos(self.odometry.heading)
        self.odometry.y += distance * math.sin(self.odometry.heading)

    def _load_premap_hints(self) -> None:
        """Load pre-mapping hints to guide exploration."""
        try:
            from .premapper import Premapper
            from pathlib import Path
            
            premap_dir = Path("explorer_state/premap")
            if not premap_dir.exists():
                return
            
            premapper = Premapper(premap_dir)
            if premapper.load_state():
                hints = premapper.get_exploration_hints()
                if hints:
                    # Store hints in planner for navigation
                    self.planner._premap_hints = hints
                    log.info(f"Loaded {len(hints)} pre-mapping hints for exploration")
                    
                    # Apply prior map if available
                    if premapper.prior_occupancy is not None:
                        # Convert prior to binary occupancy
                        binary_prior = (premapper.prior_occupancy > 0.7).astype(np.uint8) * 2  # 2 = OCCUPIED
                        binary_prior[premapper.prior_occupancy < 0.3] = 1  # 1 = FREE
                        
                        # Blend with existing map
                        current = self.world_map._grid
                        mask = (premapper.prior_occupancy >= 0.3) & (premapper.prior_occupancy <= 0.7)
                        current[mask] = binary_prior[mask]
                        
                        # Update confidence based on prior strength
                        confidence_boost = np.abs(premapper.prior_occupancy - 0.5) * 2
                        self.world_map._confidence = np.minimum(
                            255, self.world_map._confidence + confidence_boost * 50
                        )
                        
                        log.info("Applied pre-mapping prior to occupancy map")
        except Exception as e:
            log.warning(f"Failed to load pre-mapping hints: {e}")


# -- Standalone entry point --------------------------------------------------

def main() -> None:
    """Run the explorer standalone (for testing without the full vehicle runtime)."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    log.info("Visual Explorer standalone mode")

    config = ExplorerConfig()
    runtime = ExplorerRuntime(config)

    if not runtime.start():
        log.error("Failed to start explorer")
        return

    try:
        while runtime.running:
            action = runtime.step()
            log.info("Mode=%s steering=%.2f throttle=%.2f pos=(%.1f, %.1f) crumbs=%d landmarks=%d",
                     runtime.mode.name, action.steering, action.throttle,
                     runtime.odometry.x, runtime.odometry.y,
                     runtime.trail.trail_length, runtime.landmarks.count)
    except KeyboardInterrupt:
        log.info("Interrupted -- triggering return-to-home")
        runtime.trigger_return()
        while runtime.running and runtime.mode != ExplorerMode.HOME:
            action = runtime.step()
            log.info("RETURNING steering=%.2f throttle=%.2f crumbs_remaining=%d",
                     action.steering, action.throttle,
                     max(0, runtime.trail._return_index + 1))
    finally:
        runtime.stop()


if __name__ == "__main__":
    main()
