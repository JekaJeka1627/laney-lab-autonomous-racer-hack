from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile
from fastapi.responses import Response, StreamingResponse
import json
import cv2
import numpy as np

from vehicle_runtime.config import load_config
from vehicle_runtime.runtime import VehicleRuntime
from vehicle_runtime.schemas import (
    ActionResponse,
    ControlCommandPayload,
    HealthResponse,
    ManualOverrideRequest,
    SessionStopResponse,
    StatusResponse,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = load_config()
    runtime = VehicleRuntime(cfg)
    app.state.runtime = runtime
    if cfg.autostart:
        runtime.start()
    try:
        yield
    finally:
        runtime.close()


app = FastAPI(title="Vehicle Runtime", version="0.1.0", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/status", response_model=StatusResponse)
def status() -> StatusResponse:
    snap = app.state.runtime.snapshot()
    return StatusResponse(
        running=snap.running,
        estop=snap.estop,
        control_mode=snap.control_mode if snap.control_mode in {"learned", "safe_stop", "manual_override"} else "safe_stop",
        target_model_version=snap.target_model_version,
        loaded_model_version=snap.loaded_model_version,
        last_error=snap.last_error,
        last_steering=snap.last_steering,
        last_throttle=snap.last_throttle,
        loop_count=snap.loop_count,
        battery_percent=snap.battery_percent,
        battery_voltage_v=snap.battery_voltage_v,
        battery_state=snap.battery_state,
        session_active=snap.session_active,
        session_id=snap.session_id,
        last_session_artifacts_dir=snap.last_session_artifacts_dir,
        manual_override_active=snap.manual_override_active,
        manual_override_remaining_ms=snap.manual_override_remaining_ms,
    )


@app.post("/control/start", response_model=ActionResponse)
def start_loop() -> ActionResponse:
    app.state.runtime.start()
    return ActionResponse(ok=True, message="control loop started")


@app.post("/control/stop", response_model=ActionResponse)
def stop_loop() -> ActionResponse:
    app.state.runtime.stop()
    return ActionResponse(ok=True, message="control loop stopped")


@app.post("/control/estop", response_model=ActionResponse)
def estop() -> ActionResponse:
    app.state.runtime.set_estop(True)
    return ActionResponse(ok=True, message="emergency stop engaged")


@app.post("/control/release-estop", response_model=ActionResponse)
def release_estop() -> ActionResponse:
    app.state.runtime.set_estop(False)
    return ActionResponse(ok=True, message="emergency stop released")


@app.post("/control/manual-override", response_model=ActionResponse)
def manual_override(payload: ManualOverrideRequest) -> ActionResponse:
    app.state.runtime.set_manual_override(payload.steering, payload.throttle, duration_ms=payload.duration_ms)
    return ActionResponse(ok=True, message=f"manual override active for {payload.duration_ms}ms")


@app.post("/control/manual-override/clear", response_model=ActionResponse)
def clear_manual_override() -> ActionResponse:
    app.state.runtime.clear_manual_override()
    return ActionResponse(ok=True, message="manual override cleared")


@app.post("/control/step", response_model=ControlCommandPayload)
def step_once() -> ControlCommandPayload:
    cmd = app.state.runtime.step_once()
    return ControlCommandPayload(steering=cmd.steering, throttle=cmd.throttle)


@app.post("/model/reload", response_model=ActionResponse)
def reload_model() -> ActionResponse:
    app.state.runtime.reload_model()
    return ActionResponse(ok=True, message="model reload triggered")


@app.post("/model/push")
async def push_model(file: UploadFile, model_id: str = "", display_name: str = "", format: str = ""):
    """
    Accept a model file upload from a remote dashboard over WiFi.
    Writes the file to the .active-model/ directory and triggers a reload.
    This enables wireless model switching without needing SSH or a shared filesystem.
    """
    from pathlib import Path
    import shutil

    deploy_dir = Path(".active-model")
    deploy_dir.mkdir(parents=True, exist_ok=True)

    # Clear previous deployment
    for item in deploy_dir.iterdir():
        if item.name != "active_model_marker.json":
            item.unlink(missing_ok=True)

    # Write the uploaded model file
    dest = deploy_dir / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    # Write marker so the runtime knows what was deployed
    from datetime import datetime, timezone
    marker = {
        "model_id": model_id,
        "display_name": display_name,
        "format": format,
        "filename": file.filename,
        "deployed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pushed_over_wifi": True,
    }
    (deploy_dir / "active_model_marker.json").write_text(
        json.dumps(marker, indent=2) + "\n", encoding="utf-8"
    )

    # Trigger reload immediately
    app.state.runtime.reload_model()
    return {"ok": True, "filename": file.filename, "size_bytes": dest.stat().st_size}


@app.get("/model/active")
def get_active_model():
    """Return the currently deployed model info from the marker file."""
    from pathlib import Path
    marker_path = Path(".active-model") / "active_model_marker.json"
    if not marker_path.exists():
        return {"model_id": None, "message": "No model deployed"}
    return json.loads(marker_path.read_text(encoding="utf-8"))


@app.post("/session/start", response_model=ActionResponse)
def session_start() -> ActionResponse:
    session_id = app.state.runtime.start_session()
    return ActionResponse(ok=True, message=f"session started: {session_id}")


@app.post("/session/stop", response_model=SessionStopResponse)
def session_stop(upload: bool = False) -> SessionStopResponse:
    artifacts = app.state.runtime.stop_session(upload=upload)
    if not artifacts:
        return SessionStopResponse(ok=True, message="no active session", uploaded=False)
    return SessionStopResponse(
        ok=True,
        message="session stopped",
        session_id=artifacts.session_id,
        artifacts_dir=str(artifacts.root_dir),
        uploaded=upload,
    )


@app.post("/session/upload-latest", response_model=ActionResponse)
def session_upload_latest() -> ActionResponse:
    uploaded = app.state.runtime.upload_latest_session()
    return ActionResponse(ok=True, message="latest session uploaded" if uploaded else "no session artifacts to upload")


# ---------------------------------------------------------------------------
# Explorer API endpoints
# ---------------------------------------------------------------------------

@app.get("/explorer/status")
def explorer_status():
    """Get explorer runtime status including map statistics."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    return app.state.runtime.explorer.status_dict


@app.post("/explorer/start")
def explorer_start():
    """Start the explorer."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        success = app.state.runtime.explorer.start()
        return {"success": success}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/stop")
def explorer_stop():
    """Stop the explorer."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        app.state.runtime.explorer.stop()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/mission/explore")
def explorer_mission_explore(distance_ft: float = 50.0):
    """Start an exploration mission."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        app.state.runtime.explorer.set_distance_limit(distance_ft)
        success = app.state.runtime.explorer.start()
        return {"success": success, "distance_ft": distance_ft}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/mission/return")
def explorer_mission_return():
    """Start return-to-home mission."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        app.state.runtime.explorer.start_return_home()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/settings")
def explorer_settings(settings: dict):
    """Update explorer settings."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        # Apply settings to config
        if "explore_throttle" in settings:
            app.state.runtime.explorer.config.explore_throttle = settings["explore_throttle"]
        if "breadcrumb_interval_frames" in settings:
            app.state.runtime.explorer.config.breadcrumb_interval_frames = settings["breadcrumb_interval_frames"]
        if "max_explore_distance_ft" in settings:
            app.state.runtime.explorer.config.max_explore_distance_ft = settings["max_explore_distance_ft"]
        if "max_explore_seconds" in settings:
            app.state.runtime.explorer.config.max_explore_seconds = settings["max_explore_seconds"]
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/behavior")
def explorer_set_behavior(payload: dict):
    """Switch driving behavior."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        behavior_id = payload.get("behavior_id", "reactive")
        kwargs = {k: v for k, v in payload.items() if k != "behavior_id"}
        new_behavior = app.state.runtime.explorer.set_behavior(behavior_id, **kwargs)
        return {"success": True, "active_behavior": new_behavior}
    except Exception as e:
        return {"error": str(e)}


@app.get("/explorer/behaviors")
def explorer_list_behaviors():
    """List available driving behaviors."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        behaviors = app.state.runtime.explorer.get_available_behaviors()
        return {"behaviors": behaviors}
    except Exception as e:
        return {"error": str(e)}


@app.get("/explorer/variants")
def explorer_list_variants():
    """List all available explorer variants with labels, descriptions, and model availability."""
    from vehicle_runtime.explorer.config import ExplorerVariant
    from vehicle_runtime.explorer.track_model_adapter import KNOWN_TRACK_MODELS, _find_registry_root
    from pathlib import Path

    model_dirs = {
        "center-align":  _find_registry_root() / "models" / "external" / "center-align-continuous",
        "sdc-navigator": _find_registry_root() / "models" / "external" / "sdc-navigator",
    }

    def _model_available(mid: str) -> bool:
        d = model_dirs.get(mid)
        return d is not None and any(d.rglob("model.pb"))

    variants = []
    for v in ExplorerVariant:
        info = KNOWN_TRACK_MODELS.get(v.value, {})
        model_id = info.get("model_id", "")
        available = True if not model_id else _model_available(model_id)
        variants.append({
            "id": v.value,
            "label": v.label,
            "description": v.description,
            "is_hybrid": v.is_hybrid,
            "model_available": available,
        })

    current = "pure"
    if hasattr(app.state, "runtime") and hasattr(app.state.runtime, "explorer") and app.state.runtime.explorer:
        current = app.state.runtime.explorer.config.variant.value

    return {"variants": variants, "current": current}


@app.post("/explorer/variant")
def explorer_set_variant(variant_id: str):
    """Switch the explorer driving variant (pure / hybrid-autopilot / ...)."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        result = app.state.runtime.explorer.set_variant(variant_id)
        return result
    except Exception as e:
        return {"error": str(e)}


@app.get("/explorer/map-image")
def explorer_map_image():
    """Get the current occupancy map as PNG."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return Response(content=b"", media_type="image/png")
    try:
        import cv2
        import io
        from PIL import Image
        
        # Get rendered map from the explorer
        img = app.state.runtime.explorer.world_map.to_image(
            app.state.runtime.explorer.odometry.x,
            app.state.runtime.explorer.odometry.y
        )
        
        # Convert to PNG
        pil_img = Image.fromarray(img)
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        buf.seek(0)
        
        return StreamingResponse(buf, media_type="image/png")
    except Exception:
        return Response(content=b"", media_type="image/png")


@app.get("/explorer/trail")
def explorer_trail():
    """Get the breadcrumb trail data."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"crumbs": []}
    try:
        trail_data = app.state.runtime.explorer.trail.to_dict()
        return trail_data
    except Exception:
        return {"crumbs": []}


@app.post("/explorer/map-save")
def explorer_map_save():
    """Manually save the map and trail."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"success": False, "error": "Explorer not initialized"}
    try:
        from pathlib import Path
        save_dir = Path("explorer_state")
        app.state.runtime.explorer.save_state(save_dir)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/explorer/backend")
def explorer_backend_info():
    """Get information about inference backends in use."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"depth_backend": "unknown", "behavior_backend": "unknown"}
    try:
        info = {
            "depth_backend": getattr(app.state.runtime.explorer.obstacle_detector, "backend", "unknown"),
            "behavior_backend": getattr(app.state.runtime.explorer.planner._behavior, "_backend", "unknown"),
        }
        return info
    except Exception:
        return {"depth_backend": "unknown", "behavior_backend": "unknown"}


@app.get("/explorer/reexplore")
def explorer_reexplore_areas(max_results: int = 10):
    """Get areas that need re-exploration due to low confidence."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"areas": []}
    try:
        areas = app.state.runtime.explorer.world_map.get_low_confidence_areas(max_results)
        return {"areas": [{"x": x, "y": y, "confidence": conf} for x, y, conf in areas]}
    except Exception:
        return {"areas": []}


# ---------------------------------------------------------------------------
# Pre-mapping API endpoints
# ---------------------------------------------------------------------------

@app.post("/explorer/premap/photo")
def explorer_premap_add_photo(file: UploadFile, position_x: float = 0.0, position_y: float = 0.0, heading: float = 0.0):
    """Upload a photo for pre-mapping."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        from .explorer.premapper import Premapper
        from pathlib import Path
        
        # Create premap workspace
        premap_dir = Path("explorer_state/premap")
        premap_dir.mkdir(parents=True, exist_ok=True)
        
        # Save uploaded photo
        photo_path = premap_dir / file.filename
        with open(photo_path, "wb") as f:
            content = file.file.read()
            f.write(content)
        
        # Initialize premapper if needed
        if not hasattr(app.state.runtime.explorer, "premapper"):
            app.state.runtime.explorer.premapper = Premapper(premap_dir)
        
        # Add photo to premapper
        photo_id = app.state.runtime.explorer.premapper.add_photo(
            photo_path, (position_x, position_y), heading
        )
        
        return {"success": True, "photo_id": photo_id}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/premap/annotate")
def explorer_premap_annotate(photo_id: str, x: float, y: float, label: str, 
                            confidence: float = 1.0, notes: str = ""):
    """Add annotation to a pre-mapping photo."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        if not hasattr(app.state.runtime.explorer, "premapper"):
            return {"error": "No pre-mapping session active"}
        
        success = app.state.runtime.explorer.premapper.annotate_photo(
            photo_id, x, y, label, confidence, notes
        )
        
        return {"success": success}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/premap/stitch")
def explorer_premap_stitch():
    """Stitch uploaded photos into a composite map."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        if not hasattr(app.state.runtime.explorer, "premapper"):
            return {"error": "No pre-mapping session active"}
        
        panorama = app.state.runtime.explorer.premapper.stitch_photos()
        
        if panorama.size > 0:
            return {"success": True, "message": f"Stitched {len(app.state.runtime.explorer.premapper.photos)} photos"}
        else:
            return {"success": False, "error": "Stitching failed"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/premap/prior")
def explorer_premap_create_prior():
    """Create prior occupancy map from photo annotations."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        if not hasattr(app.state.runtime.explorer, "premapper"):
            return {"error": "No pre-mapping session active"}
        
        prior = app.state.runtime.explorer.premapper.create_prior_occupancy()
        
        # Apply prior to the main occupancy map
        if hasattr(app.state.runtime.explorer, "world_map"):
            # Convert prior to binary occupancy using threshold
            binary_prior = (prior > 0.7).astype(np.uint8) * 2  # 2 = OCCUPIED
            binary_prior[prior < 0.3] = 1  # 1 = FREE
            
            # Blend with existing map (prior has influence but doesn't overwrite)
            current = app.state.runtime.explorer.world_map._grid
            # Keep UNKNOWN where prior is uncertain
            mask = (prior >= 0.3) & (prior <= 0.7)
            current[mask] = binary_prior[mask]
            
            # Update confidence based on prior strength
            confidence_boost = np.abs(prior - 0.5) * 2  # 0 to 1
            app.state.runtime.explorer.world_map._confidence = np.minimum(
                255, app.state.runtime.explorer.world_map._confidence + confidence_boost * 50
            )
        
        return {"success": True, "message": "Prior map created and applied"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/explorer/premap/status")
def explorer_premap_status():
    """Get current pre-mapping status."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        if not hasattr(app.state.runtime.explorer, "premapper"):
            return {"has_premap": False, "photos": []}
        
        premapper = app.state.runtime.explorer.premapper
        hints = premapper.get_exploration_hints()
        
        return {
            "has_premap": True,
            "num_photos": len(premapper.photos),
            "has_composite": premapper.composite_map is not None,
            "has_prior": premapper.prior_occupancy is not None,
            "photos": [
                {
                    "id": p.id,
                    "filename": p.filename,
                    "num_annotations": len(p.annotations),
                    "position": (p.position_x, p.position_y)
                } for p in premapper.photos
            ],
            "hints": hints
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/explorer/premap/composite")
def explorer_premap_get_composite():
    """Get the composite stitched map as image."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return Response(content=b"", media_type="image/jpeg")
    
    try:
        if not hasattr(app.state.runtime.explorer, "premapper"):
            return Response(content=b"", media_type="image/jpeg")
        
        premapper = app.state.runtime.explorer.premapper
        if premapper.composite_map is None or premapper.composite_map.size == 0:
            return Response(content=b"", media_type="image/jpeg")
        
        # Convert to JPEG
        import io
        from PIL import Image
        
        pil_img = Image.fromarray(cv2.cvtColor(premapper.composite_map, cv2.COLOR_BGR2RGB))
        buf = io.BytesIO()
        pil_img.save(buf, format="JPEG", quality=85)
        buf.seek(0)
        
        return StreamingResponse(buf, media_type="image/jpeg")
    except Exception:
        return Response(content=b"", media_type="image/jpeg")


@app.post("/explorer/premap/save")
def explorer_premap_save():
    """Save pre-mapping state."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        if not hasattr(app.state.runtime.explorer, "premapper"):
            return {"error": "No pre-mapping session active"}
        
        app.state.runtime.explorer.premapper.save_state()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/premap/load")
def explorer_premap_load():
    """Load pre-mapping state."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    
    try:
        from .explorer.premapper import Premapper
        from pathlib import Path
        
        premap_dir = Path("explorer_state/premap")
        premapper = Premapper(premap_dir)
        
        if premapper.load_state():
            app.state.runtime.explorer.premapper = premapper
            return {"success": True, "num_photos": len(premapper.photos)}
        else:
            return {"success": False, "error": "No saved pre-mapping state found"}
    except Exception as e:
        return {"error": str(e)}
