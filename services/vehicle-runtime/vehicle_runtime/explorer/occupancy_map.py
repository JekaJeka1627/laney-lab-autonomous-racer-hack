"""
Persistent 2D occupancy grid map for the Visual Explorer.

Divides the world into a grid of cells.  Each cell is marked as:
  UNKNOWN  -- never observed
  FREE     -- the car has driven through or depth confirms no obstacle
  OCCUPIED -- depth sensing detected an obstacle at this position

The map is updated every frame from the car's position and depth readings,
saved to disk between runs, and used by the navigation planner to:
  - Prefer UNKNOWN cells (frontier-based exploration)
  - Navigate confidently through known FREE space
  - Avoid known OCCUPIED cells without re-detecting every time

Grid coordinates are in feet, matching the odometry and distance units.
"""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .config import ExplorerConfig

log = logging.getLogger(__name__)

# Cell states
UNKNOWN: int = 0
FREE: int = 1
OCCUPIED: int = 2


@dataclass
class MapConfig:
    """Parameters for the occupancy grid."""
    cell_size_ft: float = 0.5     # each cell covers 0.5 x 0.5 feet (~15cm)
    map_size_ft: float = 200.0    # map covers 200 x 200 feet total
    origin_offset_ft: float = 100.0  # origin (0,0) is at grid center
    max_depth_ft: float = 8.0     # max depth ray length from car
    depth_cone_half_angle: float = 0.52  # ~30 degrees half-angle of camera FOV
    num_depth_rays: int = 15      # rays cast per frame for map update
    free_decay_frames: int = 0    # 0 = no decay; >0 = FREE cells revert after N unvisited frames
    save_version: int = 1


class OccupancyMap:
    """
    2D occupancy grid that persists between exploration runs.

    Usage:
        omap = OccupancyMap()
        omap.load(Path("explorer_state/map.npz"))  # load previous map

        # Each frame during exploration:
        omap.update_from_position(x, y)  # mark car's cell as FREE
        omap.update_from_depth(x, y, heading, depth_sectors)  # ray-cast obstacles

        # For navigation:
        nearest = omap.nearest_frontier(x, y)  # find closest UNKNOWN cell
        is_ok = omap.is_free(target_x, target_y)  # check if a cell is safe

        # Save after run:
        omap.save(Path("explorer_state/map.npz"))
    """

    def __init__(self, config: MapConfig | None = None):
        self.config = config or MapConfig()
        c = self.config
        self._grid_size = int(c.map_size_ft / c.cell_size_ft)
        self._grid = np.full(
            (self._grid_size, self._grid_size), UNKNOWN, dtype=np.uint8
        )
        self._visit_count = np.zeros(
            (self._grid_size, self._grid_size), dtype=np.uint16
        )
        self._total_cells = self._grid_size * self._grid_size
        self._updates = 0
        self._last_update_time = ""

    # -- Coordinate conversion -----------------------------------------------

    def _world_to_grid(self, x_ft: float, y_ft: float) -> tuple[int, int]:
        """Convert world (x, y) in feet to grid (row, col)."""
        c = self.config
        col = int((x_ft + c.origin_offset_ft) / c.cell_size_ft)
        row = int((y_ft + c.origin_offset_ft) / c.cell_size_ft)
        return (
            max(0, min(self._grid_size - 1, row)),
            max(0, min(self._grid_size - 1, col)),
        )

    def _grid_to_world(self, row: int, col: int) -> tuple[float, float]:
        """Convert grid (row, col) back to world (x, y) in feet."""
        c = self.config
        x_ft = col * c.cell_size_ft - c.origin_offset_ft + c.cell_size_ft / 2
        y_ft = row * c.cell_size_ft - c.origin_offset_ft + c.cell_size_ft / 2
        return x_ft, y_ft

    def _in_bounds(self, row: int, col: int) -> bool:
        return 0 <= row < self._grid_size and 0 <= col < self._grid_size

    # -- Map updates ---------------------------------------------------------

    def update_from_position(self, x_ft: float, y_ft: float) -> None:
        """Mark the car's current cell (and neighbors) as FREE."""
        row, col = self._world_to_grid(x_ft, y_ft)
        # Mark a small footprint around the car as free (car is ~1ft wide)
        for dr in range(-1, 2):
            for dc in range(-1, 2):
                r, c = row + dr, col + dc
                if self._in_bounds(r, c):
                    self._grid[r, c] = FREE
                    self._visit_count[r, c] += 1
        self._updates += 1

    def update_from_depth(
        self,
        x_ft: float,
        y_ft: float,
        heading: float,
        sector_scores: tuple[float, float, float],
        max_range_ft: float | None = None,
    ) -> None:
        """
        Cast rays from the car's position along the camera FOV and mark
        cells as FREE (no obstacle along ray) or OCCUPIED (obstacle hit).

        Args:
            x_ft, y_ft: Car position in feet.
            heading: Car heading in radians.
            sector_scores: (left, center, right) obstacle closeness 0-1.
            max_range_ft: Override max ray length.
        """
        max_range = max_range_ft or self.config.max_depth_ft
        half_angle = self.config.depth_cone_half_angle
        n_rays = self.config.num_depth_rays

        for i in range(n_rays):
            # Spread rays across the camera FOV
            frac = i / max(n_rays - 1, 1)  # 0 to 1
            ray_angle = heading + half_angle - 2 * half_angle * frac

            # Determine obstacle distance for this ray based on which sector it falls in
            if frac < 0.33:
                closeness = sector_scores[0]  # left sector
            elif frac < 0.67:
                closeness = sector_scores[1]  # center sector
            else:
                closeness = sector_scores[2]  # right sector

            # Convert closeness (0=far, 1=near) to distance in feet
            if closeness > 0.05:
                obstacle_dist = max_range * (1.0 - closeness)
            else:
                obstacle_dist = max_range  # nothing detected, full range is free

            # Walk along the ray, marking cells
            step_size = self.config.cell_size_ft * 0.5
            dist = 0.0
            while dist < obstacle_dist:
                rx = x_ft + dist * math.cos(ray_angle)
                ry = y_ft + dist * math.sin(ray_angle)
                row, col = self._world_to_grid(rx, ry)
                if not self._in_bounds(row, col):
                    break
                if self._grid[row, col] != OCCUPIED:
                    self._grid[row, col] = FREE
                dist += step_size

            # Mark the endpoint as OCCUPIED if obstacle was detected
            if closeness > 0.2:
                ox = x_ft + obstacle_dist * math.cos(ray_angle)
                oy = y_ft + obstacle_dist * math.sin(ray_angle)
                orow, ocol = self._world_to_grid(ox, oy)
                if self._in_bounds(orow, ocol):
                    self._grid[orow, ocol] = OCCUPIED
        
        # Update timestamp for real-time dashboard
        from datetime import datetime
        self._last_update_time = datetime.now().strftime("%H:%M:%S")
        self._updates += 1

    # -- Navigation queries --------------------------------------------------

    def cell_state(self, x_ft: float, y_ft: float) -> int:
        """Return the state of the cell at (x, y): UNKNOWN, FREE, or OCCUPIED."""
        row, col = self._world_to_grid(x_ft, y_ft)
        return int(self._grid[row, col])

    def is_free(self, x_ft: float, y_ft: float) -> bool:
        return self.cell_state(x_ft, y_ft) == FREE

    def is_occupied(self, x_ft: float, y_ft: float) -> bool:
        return self.cell_state(x_ft, y_ft) == OCCUPIED

    def is_unknown(self, x_ft: float, y_ft: float) -> bool:
        return self.cell_state(x_ft, y_ft) == UNKNOWN

    def nearest_frontier(
        self, x_ft: float, y_ft: float, max_search_radius_ft: float = 50.0
    ) -> tuple[float, float] | None:
        """
        Find the nearest UNKNOWN cell that borders a FREE cell (a frontier).
        This is the most interesting place to explore next.

        Returns (x, y) in feet, or None if no frontier exists within range.
        """
        car_row, car_col = self._world_to_grid(x_ft, y_ft)
        max_cells = int(max_search_radius_ft / self.config.cell_size_ft)

        best_dist_sq = float("inf")
        best_pos: tuple[float, float] | None = None

        # BFS-like expanding ring search
        for radius in range(1, max_cells):
            found_in_ring = False
            for dr in range(-radius, radius + 1):
                for dc in [-radius, radius]:
                    r, c = car_row + dr, car_col + dc
                    result = self._check_frontier_cell(r, c, car_row, car_col, best_dist_sq)
                    if result is not None:
                        best_dist_sq, best_pos = result
                        found_in_ring = True
            for dc in range(-radius + 1, radius):
                for dr in [-radius, radius]:
                    r, c = car_row + dr, car_col + dc
                    result = self._check_frontier_cell(r, c, car_row, car_col, best_dist_sq)
                    if result is not None:
                        best_dist_sq, best_pos = result
                        found_in_ring = True
            # If we found a frontier in this ring, no need to search farther
            if found_in_ring and best_pos is not None:
                return best_pos

        return best_pos

    def _check_frontier_cell(
        self, row: int, col: int, car_row: int, car_col: int, best_dist_sq: float
    ) -> tuple[float, tuple[float, float]] | None:
        """Check if (row, col) is a frontier cell closer than best_dist_sq."""
        if not self._in_bounds(row, col):
            return None
        if self._grid[row, col] != UNKNOWN:
            return None
        # Must border at least one FREE cell
        has_free_neighbor = False
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = row + dr, col + dc
            if self._in_bounds(nr, nc) and self._grid[nr, nc] == FREE:
                has_free_neighbor = True
                break
        if not has_free_neighbor:
            return None
        dist_sq = (row - car_row) ** 2 + (col - car_col) ** 2
        if dist_sq < best_dist_sq:
            world_x, world_y = self._grid_to_world(row, col)
            return dist_sq, (world_x, world_y)
        return None

    # -- Statistics ----------------------------------------------------------

    @property
    def stats(self) -> dict:
        """Return map coverage statistics."""
        free_count = int(np.sum(self._grid == FREE))
        occupied_count = int(np.sum(self._grid == OCCUPIED))
        unknown_count = int(np.sum(self._grid == UNKNOWN))
        total = self._total_cells
        return {
            "grid_size": self._grid_size,
            "cell_size_ft": self.config.cell_size_ft,
            "total_cells": total,
            "free_cells": free_count,
            "occupied_cells": occupied_count,
            "unknown_cells": unknown_count,
            "explored_pct": round(100 * (free_count + occupied_count) / total, 2),
            "free_area_sq_ft": round(free_count * self.config.cell_size_ft ** 2, 1),
            "updates": self._updates,
        }

    # -- Visualization -------------------------------------------------------

    def to_image(self, car_x: float = 0, car_y: float = 0) -> np.ndarray:
        """
        Render the map as an RGB image for the dashboard.

        Colors:
          UNKNOWN  = dark gray (40, 40, 40)
          FREE     = white (240, 240, 240)
          OCCUPIED = red (200, 60, 60)
          Car      = blue dot
        """
        img = np.full((self._grid_size, self._grid_size, 3), 40, dtype=np.uint8)

        free_mask = self._grid == FREE
        occupied_mask = self._grid == OCCUPIED

        img[free_mask] = [240, 240, 240]
        img[occupied_mask] = [200, 60, 60]

        # Draw car position
        car_row, car_col = self._world_to_grid(car_x, car_y)
        cv2.circle(img, (car_col, car_row), 3, (60, 120, 255), -1)

        return img

    @property
    def last_update_time(self) -> str:
        """Return the timestamp of the last map update (HH:MM:SS format)."""
        return self._last_update_time

    def to_cropped_image(
        self, car_x: float = 0, car_y: float = 0, radius_cells: int = 100
    ) -> np.ndarray:
        """Render a cropped view around the car for the dashboard."""
        full = self.to_image(car_x, car_y)
        car_row, car_col = self._world_to_grid(car_x, car_y)

        r1 = max(0, car_row - radius_cells)
        r2 = min(self._grid_size, car_row + radius_cells)
        c1 = max(0, car_col - radius_cells)
        c2 = min(self._grid_size, car_col + radius_cells)

        cropped = full[r1:r2, c1:c2]
        if cropped.shape[0] < 10 or cropped.shape[1] < 10:
            return full
        return cropped

    # -- Persistence ---------------------------------------------------------

    def save(self, path: Path) -> None:
        """Save the map grid and metadata to disk."""
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            str(path),
            grid=self._grid,
            visit_count=self._visit_count,
        )
        # Save metadata alongside
        meta_path = path.with_suffix(".json")
        meta = {
            "version": self.config.save_version,
            "grid_size": self._grid_size,
            "cell_size_ft": self.config.cell_size_ft,
            "map_size_ft": self.config.map_size_ft,
            "origin_offset_ft": self.config.origin_offset_ft,
            "stats": self.stats,
        }
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        log.info("Map saved to %s (%.1f%% explored, %d updates)",
                 path, self.stats["explored_pct"], self._updates)

    def load(self, path: Path) -> bool:
        """Load a previously saved map. Returns True if successful."""
        if not path.exists():
            log.info("No saved map at %s -- starting fresh", path)
            return False
        try:
            data = np.load(str(path))
            loaded_grid = data["grid"]
            if loaded_grid.shape == (self._grid_size, self._grid_size):
                self._grid = loaded_grid
                if "visit_count" in data:
                    self._visit_count = data["visit_count"]
                log.info("Map loaded from %s (%.1f%% explored)",
                         path, self.stats["explored_pct"])
                return True
            else:
                log.warning("Map size mismatch: saved %s vs expected %s -- starting fresh",
                            loaded_grid.shape, (self._grid_size, self._grid_size))
                return False
        except Exception:
            log.exception("Failed to load map from %s", path)
            return False

    def merge(self, other: OccupancyMap) -> None:
        """
        Merge another map into this one.  Useful for combining maps from
        multiple runs that may have been started from different positions.

        Merge rules:
          OCCUPIED wins over everything (obstacle is real)
          FREE wins over UNKNOWN (we have information)
          UNKNOWN stays if both are UNKNOWN
        """
        occupied_mask = other._grid == OCCUPIED
        free_mask = (other._grid == FREE) & (self._grid != OCCUPIED)

        self._grid[occupied_mask] = OCCUPIED
        self._grid[free_mask] = FREE
        self._visit_count += other._visit_count
        log.info("Merged map: now %.1f%% explored", self.stats["explored_pct"])
