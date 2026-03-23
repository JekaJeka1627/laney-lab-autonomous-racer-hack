"""
Pre-mapping system for Visual Explorer.
Allows users to provide photos and annotations before exploration begins.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Tuple, Dict, Any
import cv2
import numpy as np

log = logging.getLogger(__name__)


@dataclass
class PhotoAnnotation:
    """User annotation on a photo."""
    x: float  # Normalized x coordinate [0, 1]
    y: float  # Normalized y coordinate [0, 1]
    label: str  # "obstacle", "free", "wall", "door", "ramp", etc.
    confidence: float = 1.0  # User confidence [0, 1]
    notes: str = ""


@dataclass
class Photo:
    """A single photo in the pre-mapping set."""
    id: str
    filename: str
    timestamp: str
    position_x: float = 0.0  # World position in feet
    position_y: float = 0.0  # World position in feet
    heading: float = 0.0  # Camera heading in radians
    annotations: List[PhotoAnnotation] = None
    
    def __post_init__(self):
        if self.annotations is None:
            self.annotations = []


class Premapper:
    """
    Handles user-provided photos and annotations to create a prior map
    that guides exploration.
    """
    
    def __init__(self, workspace_dir: Path):
        self.workspace_dir = workspace_dir
        self.photos: List[Photo] = []
        self.composite_map: np.ndarray | None = None
        self.prior_occupancy: np.ndarray | None = None
        self.metadata: Dict[str, Any] = {}
        
    def add_photo(self, photo_path: Path, position: Tuple[float, float] = (0, 0), 
                  heading: float = 0.0) -> str:
        """Add a photo to the pre-mapping set."""
        if not photo_path.exists():
            raise FileNotFoundError(f"Photo not found: {photo_path}")
        
        photo_id = f"photo_{len(self.photos):04d}"
        photo = Photo(
            id=photo_id,
            filename=photo_path.name,
            timestamp=datetime.now().isoformat(),
            position_x=position[0],
            position_y=position[1],
            heading=heading
        )
        
        self.photos.append(photo)
        log.info(f"Added photo {photo_id} at position ({position[0]}, {position[1]})")
        return photo_id
    
    def annotate_photo(self, photo_id: str, x: float, y: float, label: str, 
                      confidence: float = 1.0, notes: str = "") -> bool:
        """Add annotation to a photo."""
        for photo in self.photos:
            if photo.id == photo_id:
                annotation = PhotoAnnotation(x=x, y=y, label=label, 
                                           confidence=confidence, notes=notes)
                photo.annotations.append(annotation)
                log.info(f"Added annotation '{label}' to {photo_id}")
                return True
        return False
    
    def stitch_photos(self) -> np.ndarray:
        """
        Stitch photos together into a composite view.
        Uses OpenCV's stitching algorithm for best results.
        """
        if len(self.photos) < 2:
            log.warning("Need at least 2 photos for stitching")
            return np.array([])
        
        # Load images
        images = []
        for photo in self.photos:
            img_path = self.workspace_dir / photo.filename
            if img_path.exists():
                img = cv2.imread(str(img_path))
                if img is not None:
                    images.append(img)
        
        if len(images) < 2:
            log.error("Could not load enough images for stitching")
            return np.array([])
        
        try:
            # Use OpenCV's stitcher
            stitcher = cv2.Stitcher_create()
            status, panorama = stitcher.stitch(images)
            
            if status == cv2.Stitcher_OK:
                self.composite_map = panorama
                log.info(f"Successfully stitched {len(images)} photos")
                return panorama
            else:
                log.error(f"Stitching failed with status: {status}")
                return np.array([])
        except Exception as e:
            log.error(f"Stitching error: {e}")
            return np.array([])
    
    def create_prior_occupancy(self, map_size: int = 400, cell_size_ft: float = 0.5) -> np.ndarray:
        """
        Convert photo annotations into a prior occupancy map.
        Returns a grid where values indicate probability of occupancy.
        """
        # Initialize with unknown (0.5 probability)
        prior = np.full((map_size, map_size), 0.5, dtype=np.float32)
        
        if not self.composite_map is not None and len(self.photos) > 0:
            # If we have a composite map, use it as base
            if self.composite_map.size > 0:
                # Resize composite to match our grid
                resized = cv2.resize(self.composite_map, (map_size, map_size))
                # Convert to grayscale and normalize
                gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
                prior = gray.astype(np.float32) / 255.0
        
        # Apply photo annotations
        for photo in self.photos:
            for annotation in photo.annotations:
                # Convert normalized coordinates to grid coordinates
                grid_x = int(annotation.x * map_size)
                grid_y = int(annotation.y * map_size)
                
                if 0 <= grid_x < map_size and 0 <= grid_y < map_size:
                    # Update prior based on annotation
                    if annotation.label == "obstacle":
                        prior[grid_y, grid_x] = min(1.0, prior[grid_y, grid_x] + 0.3 * annotation.confidence)
                        # Also mark nearby cells as likely obstacles
                        for dx in range(-2, 3):
                            for dy in range(-2, 3):
                                nx, ny = grid_x + dx, grid_y + dy
                                if 0 <= nx < map_size and 0 <= ny < map_size:
                                    dist = np.sqrt(dx*dx + dy*dy)
                                    if dist > 0:
                                        prior[ny, nx] = min(1.0, prior[ny, nx] + 0.1 * annotation.confidence / dist)
                    
                    elif annotation.label == "free":
                        prior[grid_y, grid_x] = max(0.0, prior[grid_y, grid_x] - 0.3 * annotation.confidence)
                        # Mark nearby cells as likely free
                        for dx in range(-1, 2):
                            for dy in range(-1, 2):
                                nx, ny = grid_x + dx, grid_y + dy
                                if 0 <= nx < map_size and 0 <= ny < map_size:
                                    prior[ny, nx] = max(0.0, prior[ny, nx] - 0.1 * annotation.confidence)
                    
                    elif annotation.label == "wall":
                        # Walls are strong obstacles
                        prior[grid_y, grid_x] = 0.9
                        # Extend wall in likely direction
                        for dx in range(-5, 6):
                            nx = grid_x + dx
                            if 0 <= nx < map_size:
                                prior[grid_y, nx] = max(prior[grid_y, nx], 0.7)
        
        self.prior_occupancy = prior
        log.info(f"Created prior occupancy map with {len(self.photos)} photos")
        return prior
    
    def save_state(self) -> None:
        """Save pre-mapping state to disk."""
        self.workspace_dir.mkdir(parents=True, exist_ok=True)
        
        # Save photos metadata
        photos_data = []
        for photo in self.photos:
            photos_data.append({
                "id": photo.id,
                "filename": photo.filename,
                "timestamp": photo.timestamp,
                "position_x": photo.position_x,
                "position_y": photo.position_y,
                "heading": photo.heading,
                "annotations": [
                    {
                        "x": a.x, "y": a.y, "label": a.label,
                        "confidence": a.confidence, "notes": a.notes
                    } for a in photo.annotations
                ]
            })
        
        # Save metadata
        metadata = {
            "created_at": datetime.now().isoformat(),
            "num_photos": len(self.photos),
            "has_composite": self.composite_map is not None,
            "has_prior": self.prior_occupancy is not None,
            "photos": photos_data
        }
        
        (self.workspace_dir / "premap_metadata.json").write_text(
            json.dumps(metadata, indent=2), encoding="utf-8"
        )
        
        # Save composite map if available
        if self.composite_map is not None:
            cv2.imwrite(str(self.workspace_dir / "composite_map.jpg"), self.composite_map)
        
        # Save prior occupancy if available
        if self.prior_occupancy is not None:
            np.savez_compressed(
                str(self.workspace_dir / "prior_occupancy.npz"),
                prior=self.prior_occupancy
            )
        
        log.info(f"Saved pre-mapping state to {self.workspace_dir}")
    
    def load_state(self) -> bool:
        """Load pre-mapping state from disk."""
        metadata_path = self.workspace_dir / "premap_metadata.json"
        if not metadata_path.exists():
            return False
        
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.metadata = metadata
            
            # Load photos
            self.photos = []
            for photo_data in metadata.get("photos", []):
                photo = Photo(
                    id=photo_data["id"],
                    filename=photo_data["filename"],
                    timestamp=photo_data["timestamp"],
                    position_x=photo_data.get("position_x", 0.0),
                    position_y=photo_data.get("position_y", 0.0),
                    heading=photo_data.get("heading", 0.0)
                )
                
                # Load annotations
                for ann_data in photo_data.get("annotations", []):
                    annotation = PhotoAnnotation(
                        x=ann_data["x"],
                        y=ann_data["y"],
                        label=ann_data["label"],
                        confidence=ann_data.get("confidence", 1.0),
                        notes=ann_data.get("notes", "")
                    )
                    photo.annotations.append(annotation)
                
                self.photos.append(photo)
            
            # Load composite map
            composite_path = self.workspace_dir / "composite_map.jpg"
            if composite_path.exists():
                self.composite_map = cv2.imread(str(composite_path))
            
            # Load prior occupancy
            prior_path = self.workspace_dir / "prior_occupancy.npz"
            if prior_path.exists():
                data = np.load(str(prior_path))
                self.prior_occupancy = data["prior"]
            
            log.info(f"Loaded pre-mapping state: {len(self.photos)} photos")
            return True
        except Exception as e:
            log.error(f"Failed to load pre-mapping state: {e}")
            return False
    
    def get_exploration_hints(self) -> List[Dict[str, Any]]:
        """
        Generate exploration hints based on user annotations.
        Returns areas of interest for the explorer to prioritize.
        """
        hints = []
        
        # Collect all annotations
        all_annotations = []
        for photo in self.photos:
            for ann in photo.annotations:
                # Convert to world coordinates (approximate)
                world_x = photo.position_x + (ann.x - 0.5) * 10  # Assume 10ft view width
                world_y = photo.position_y + (ann.y - 0.5) * 10  # Assume 10ft view height
                all_annotations.append({
                    "x": world_x,
                    "y": world_y,
                    "label": ann.label,
                    "confidence": ann.confidence,
                    "notes": ann.notes
                })
        
        # Generate hints based on annotation types
        for ann in all_annotations:
            if ann["label"] == "obstacle" and ann["confidence"] > 0.7:
                hints.append({
                    "type": "avoid",
                    "position": (ann["x"], ann["y"]),
                    "reason": f"User-marked obstacle: {ann['notes']}",
                    "priority": "high"
                })
            elif ann["label"] == "free":
                hints.append({
                    "type": "explore",
                    "position": (ann["x"], ann["y"]),
                    "reason": f"User-marked clear area: {ann['notes']}",
                    "priority": "medium"
                })
            elif ann["label"] == "door" or ann["label"] == "entrance":
                hints.append({
                    "type": "investigate",
                    "position": (ann["x"], ann["y"]),
                    "reason": f"Potential entrance: {ann['notes']}",
                    "priority": "high"
                })
        
        return hints
