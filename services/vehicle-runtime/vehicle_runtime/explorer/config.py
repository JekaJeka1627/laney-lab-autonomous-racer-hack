"""
Configuration for the Visual Explorer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class ExplorerVariant(str, Enum):
    PURE              = "pure"               # rule-based, no track model
    HYBRID_AUTOPILOT  = "hybrid-autopilot"   # uses whichever track model is active
    HYBRID_CENTER     = "hybrid-center-align"
    HYBRID_SDC        = "hybrid-sdc-navigator"

    @property
    def label(self) -> str:
        return {
            "pure":                  "Pure Explorer",
            "hybrid-autopilot":      "Hybrid Autopilot",
            "hybrid-center-align":   "Hybrid + Center-Align",
            "hybrid-sdc-navigator":  "Hybrid + WSU Final-Traveller PPO",
        }.get(self.value, self.value)

    @property
    def description(self) -> str:
        return {
            "pure":
                "Rule-based obstacle avoidance and frontier exploration. "
                "No track model required.",
            "hybrid-autopilot":
                "Borrows steering reflexes from the currently active track model. "
                "Explorer overrides when obstacles are detected.",
            "hybrid-center-align":
                "Uses Center-Align continuous PPO for smooth steering. "
                "Best for open spaces; fast and fluid.",
            "hybrid-sdc-navigator":
                "Uses WSU Final-Traveller PPO for stable steering. "
                "More conservative, good for cluttered areas.",
        }.get(self.value, "")

    @property
    def is_hybrid(self) -> bool:
        return self.value != "pure"


@dataclass
class ExplorerConfig:
    # -- Obstacle detection --------------------------------------------------
    midas_model_path: Path = Path("models/midas_small.onnx")
    midas_input_size: tuple[int, int] = (256, 256)
    obstacle_close_threshold: float = 0.7   # relative depth, 0-1 (higher = closer)
    obstacle_caution_threshold: float = 0.5
    sector_count: int = 3  # left / center / right

    # -- Breadcrumb trail ----------------------------------------------------
    breadcrumb_interval_frames: int = 15  # drop a crumb every N frames (~1.5s at 10fps)
    breadcrumb_reach_radius: float = 0.5  # how close to a crumb counts as "reached"
    max_breadcrumbs: int = 2000           # limit trail length

    # -- Visual landmarks (Phase 2) -----------------------------------------
    landmark_interval_frames: int = 30     # save landmark every N frames
    orb_features_per_frame: int = 500
    match_ratio_threshold: float = 0.75    # Lowe's ratio test
    revisit_match_count: int = 30          # min good matches to declare revisit
    landmark_thumbnail_size: tuple[int, int] = (64, 64)

    # -- Navigation ----------------------------------------------------------
    explore_throttle: float = 0.4          # forward speed during exploration
    return_throttle: float = 0.3           # slower on return trip
    avoid_throttle: float = 0.2            # slowest when avoiding obstacles
    steering_gain: float = 1.5             # proportional steering toward waypoint
    max_steering: float = 1.0              # clamp

    # -- Safety --------------------------------------------------------------
    emergency_stop_threshold: float = 0.85  # very close obstacle -> full stop
    stuck_timeout_seconds: float = 10.0     # no progress for this long -> recovery
    max_explore_seconds: float = 300.0      # auto return-to-home after 5 minutes
    max_explore_distance_ft: float = 0.0    # 0 = unlimited; >0 = return after N feet

    # -- Speed calibration ---------------------------------------------------
    # The DeepRacer at throttle=0.4 moves roughly 0.8 m/s (~2.6 ft/s).
    # Adjust this if your car moves faster/slower.
    speed_ft_per_sec_at_full_throttle: float = 6.5  # ~2 m/s at throttle=1.0

    # -- Camera --------------------------------------------------------------
    front_camera_index: int = 0
    usb_camera_index: int = -1             # -1 = auto-detect; >=0 = specific index
    usb_camera_auto_detect: bool = True    # scan /dev/video* for second camera
    usb_camera_max_scan: int = 4           # scan indices 0..N-1 during auto-detect
    usb_camera_role: str = "stereo"          # "stereo" (forward-facing, side-by-side for depth)
    frame_width: int = 320
    frame_height: int = 240
    target_fps: float = 10.0

    # -- Explorer variant ----------------------------------------------------
    variant: ExplorerVariant = ExplorerVariant.PURE
