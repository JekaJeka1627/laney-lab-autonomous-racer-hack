from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import Response, StreamingResponse
import json

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
