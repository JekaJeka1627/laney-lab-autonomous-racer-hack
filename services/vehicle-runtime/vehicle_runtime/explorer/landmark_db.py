"""
Visual landmark database for place recognition (Phase 2).

Stores ORB feature descriptors at waypoints the car creates during
exploration. When the car sees a similar feature pattern later, it
recognizes it has been there before -- enabling exploration bias toward
unvisited areas and loop closure for odometry drift correction.
"""
from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from .config import ExplorerConfig

log = logging.getLogger(__name__)


@dataclass
class VisualLandmark:
    """A stored visual reference point in the world."""
    landmark_id: int
    position: tuple[float, float]  # (x, y) from odometry
    heading: float                  # radians
    descriptors: np.ndarray         # ORB descriptors (N, 32) uint8
    thumbnail: np.ndarray           # small RGB image for debugging
    timestamp: float
    visit_count: int = 1


class LandmarkDatabase:
    """
    Stores and matches visual landmarks for place recognition.

    Usage:
        db = LandmarkDatabase(config)

        # During exploration, periodically save landmarks:
        db.maybe_save(frame_bgr, x, y, heading, frame_index)

        # Check if current view matches a known place:
        match = db.find_match(frame_bgr)
        if match is not None:
            print(f"Revisiting landmark {match.landmark_id}")
    """

    def __init__(self, config: ExplorerConfig):
        self.config = config
        self._landmarks: list[VisualLandmark] = []
        self._next_id: int = 0
        self._frames_since_save: int = 0

        # ORB detector and BFMatcher (Hamming distance for binary descriptors)
        self._orb = cv2.ORB_create(nfeatures=config.orb_features_per_frame)
        self._matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)

    @property
    def count(self) -> int:
        return len(self._landmarks)

    @property
    def landmarks(self) -> list[VisualLandmark]:
        return list(self._landmarks)

    def maybe_save(
        self, frame_bgr: np.ndarray,
        x: float, y: float, heading: float,
        frame_index: int,
    ) -> VisualLandmark | None:
        """
        Save a landmark if enough frames have passed.
        Returns the new landmark if saved, None otherwise.
        """
        self._frames_since_save += 1
        if self._frames_since_save < self.config.landmark_interval_frames:
            return None

        self._frames_since_save = 0
        return self._save_landmark(frame_bgr, x, y, heading)

    def _save_landmark(
        self, frame_bgr: np.ndarray,
        x: float, y: float, heading: float,
    ) -> VisualLandmark | None:
        """Extract features and store a new landmark."""
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        keypoints, descriptors = self._orb.detectAndCompute(gray, None)

        if descriptors is None or len(descriptors) < 10:
            return None  # not enough features in this frame

        # Create thumbnail
        th, tw = self.config.landmark_thumbnail_size
        thumbnail = cv2.resize(frame_bgr, (tw, th), interpolation=cv2.INTER_AREA)
        thumbnail_rgb = cv2.cvtColor(thumbnail, cv2.COLOR_BGR2RGB)

        landmark = VisualLandmark(
            landmark_id=self._next_id,
            position=(x, y),
            heading=heading,
            descriptors=descriptors,
            thumbnail=thumbnail_rgb,
            timestamp=time.time(),
        )
        self._landmarks.append(landmark)
        self._next_id += 1
        log.debug("Saved landmark %d at (%.2f, %.2f) with %d descriptors",
                  landmark.landmark_id, x, y, len(descriptors))
        return landmark

    def find_match(self, frame_bgr: np.ndarray) -> VisualLandmark | None:
        """
        Check if the current frame matches any stored landmark.
        Returns the best matching landmark, or None if no match.
        """
        if not self._landmarks:
            return None

        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        _, query_desc = self._orb.detectAndCompute(gray, None)

        if query_desc is None or len(query_desc) < 10:
            return None

        best_match: VisualLandmark | None = None
        best_good_count = 0

        for landmark in self._landmarks:
            good_count = self._count_good_matches(query_desc, landmark.descriptors)
            if good_count > best_good_count:
                best_good_count = good_count
                best_match = landmark

        if best_good_count >= self.config.revisit_match_count:
            if best_match is not None:
                best_match.visit_count += 1
                log.debug("Matched landmark %d with %d good matches",
                          best_match.landmark_id, best_good_count)
            return best_match

        return None

    def _count_good_matches(
        self, desc_a: np.ndarray, desc_b: np.ndarray
    ) -> int:
        """Count good feature matches using Lowe's ratio test."""
        try:
            matches = self._matcher.knnMatch(desc_a, desc_b, k=2)
        except cv2.error:
            return 0

        good = 0
        for match_pair in matches:
            if len(match_pair) == 2:
                m, n = match_pair
                if m.distance < self.config.match_ratio_threshold * n.distance:
                    good += 1
        return good

    def least_visited_direction(
        self, current_x: float, current_y: float, current_heading: float,
    ) -> float:
        """
        Return a steering bias toward the least-visited direction.
        Useful for exploration: prefer going where we have fewer landmarks.
        """
        if not self._landmarks:
            return 0.0  # no data, go straight

        # Count landmarks in left vs right hemisphere relative to current heading
        left_visits = 0
        right_visits = 0

        for lm in self._landmarks:
            dx = lm.position[0] - current_x
            dy = lm.position[1] - current_y
            angle_to = math.atan2(dy, dx)
            relative = _normalize_angle(angle_to - current_heading)

            if relative < 0:
                left_visits += lm.visit_count
            else:
                right_visits += lm.visit_count

        # Steer toward the less-visited side
        if left_visits < right_visits:
            return -0.3  # bias left
        elif right_visits < left_visits:
            return 0.3   # bias right
        return 0.0


def _normalize_angle(angle: float) -> float:
    """Normalize angle to [-pi, pi]."""
    while angle > math.pi:
        angle -= 2 * math.pi
    while angle < -math.pi:
        angle += 2 * math.pi
    return angle
