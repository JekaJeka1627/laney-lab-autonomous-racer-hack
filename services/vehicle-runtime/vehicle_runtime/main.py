from __future__ import annotations

from contextlib import asynccontextmanager
import hashlib
import io
import time
import shutil
import zipfile
import os
import re
import threading
import logging
from pathlib import Path

from fastapi import FastAPI, UploadFile
from fastapi import HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
import json
import cv2
import numpy as np
from PIL import Image

from vehicle_runtime.actuators import ControlCommand, DeepRacerActuator
from vehicle_runtime.config import load_config
from vehicle_runtime.explorer.config import ExplorerConfig
from vehicle_runtime.explorer.explorer_runtime import ExplorerRuntime
from vehicle_runtime.frame_sources import build_frame_source
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
    global _PREVIEW_CAMERA_SOURCE
    cfg = load_config()
    runtime = VehicleRuntime(cfg)
    app.state.runtime = runtime
    app.state.stock_runner = StockDeepRacerRunner()
    app.state.stock_recorder = StockRunRecorder(runtime)
    app.state.bench_actuator = DeepRacerActuator(base_url="https://127.0.0.1")
    app.state.explorer_controller = ExplorerController(runtime, app.state.bench_actuator)
    app.state.runtime.explorer = app.state.explorer_controller.explorer
    app.state.bench_override = None
    try:
        _PREVIEW_CAMERA_SOURCE = _init_preview_camera()
    except Exception:
        _PREVIEW_CAMERA_SOURCE = None
    if cfg.autostart:
        runtime.start()
    try:
        yield
    finally:
        if _PREVIEW_CAMERA_SOURCE is not None:
            try:
                _PREVIEW_CAMERA_SOURCE.close()
            except Exception:
                pass
        try:
            app.state.stock_recorder.stop()
        except Exception:
            pass
        try:
            app.state.explorer_controller.stop()
        except Exception:
            pass
        try:
            app.state.bench_actuator.close()
        except Exception:
            pass
        runtime.close()


app = FastAPI(title="Vehicle Runtime", version="0.1.0", lifespan=lifespan)
_LAST_CAMERA_JPEG: bytes | None = None
_ACTIVE_MODEL_DIR = Path(".active-model")
_MODEL_CACHE_DIR = Path(".model-cache")
_PREVIEW_CAMERA_SOURCE = None
log = logging.getLogger(__name__)


class StockDeepRacerRunner:
    def __init__(self) -> None:
        self._base_url = os.getenv("VEHICLE_STOCK_DEEPRACER_URL", "https://127.0.0.1").rstrip("/")
        self._token_path = Path(os.getenv("VEHICLE_STOCK_TOKEN_PATH", "/opt/aws/deepracer/token.txt"))
        self._artifacts_dir = Path(os.getenv("VEHICLE_STOCK_ARTIFACTS_DIR", "/opt/aws/deepracer/artifacts"))
        self._loaded_model_id: str | None = None
        self._running = False

    @property
    def loaded_model_id(self) -> str | None:
        return self._loaded_model_id

    @property
    def running(self) -> bool:
        return self._running

    def _session(self):
        try:
            import requests  # type: ignore
            import urllib3  # type: ignore
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("requests is required for stock DeepRacer integration") from exc
        urllib3.disable_warnings()
        session = requests.Session()
        session.verify = False
        session.cookies.set("deepracer_token", self._token_path.read_text(encoding="utf-8").strip())
        response = session.get(f"{self._base_url}/", timeout=10)
        response.raise_for_status()
        match = re.search(r'<meta name="csrf-token" content="([^"]+)"', response.text)
        if not match:
            raise RuntimeError("Unable to locate stock DeepRacer CSRF token")
        session.headers.update({
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": match.group(1),
            "Referer": f"{self._base_url}/",
            "Origin": self._base_url,
        })
        return session

    def _request_json(self, method: str, path: str, *, payload: dict | None = None) -> dict:
        session = self._session()
        response = session.request(method, f"{self._base_url}{path}", json=payload, timeout=20)
        response.raise_for_status()
        return response.json()

    def artifact_exists(self, model_id: str) -> bool:
        path = self._artifacts_dir / model_id
        return path.is_dir() and (path / "model.pb").exists() and (path / "model_metadata.json").exists()

    def stage_model_artifact(self, model_id: str, source_dir: Path | None) -> Path:
        target_dir = self._artifacts_dir / model_id
        target_dir.mkdir(parents=True, exist_ok=True)

        if source_dir is not None:
            pb_candidates = [source_dir / "model.pb", source_dir / "agent" / "model.pb"]
            pb_path = next((candidate for candidate in pb_candidates if candidate.exists()), None)
            meta_path = source_dir / "model_metadata.json"
            if pb_path is None:
                raise RuntimeError(f"No model.pb found for {model_id}")
            if not meta_path.exists():
                existing_meta = target_dir / "model_metadata.json"
                if existing_meta.exists():
                    meta_path = existing_meta
                else:
                    raise RuntimeError(f"No model_metadata.json found for {model_id}")
            shutil.copy2(pb_path, target_dir / "model.pb")
            if Path(meta_path) != (target_dir / "model_metadata.json"):
                shutil.copy2(meta_path, target_dir / "model_metadata.json")

        checksum_target = target_dir / "checksum.txt"
        checksum = hashlib.md5((target_dir / "model.pb").read_bytes()).hexdigest()
        checksum_target.write_text(checksum + "\n", encoding="utf-8")
        return target_dir

    def activate_model(self, model_id: str, source_dir: Path | None = None) -> dict:
        if source_dir is not None or not self.artifact_exists(model_id):
            self.stage_model_artifact(model_id, source_dir)
        response = self._request_json("PUT", f"/api/models/{model_id}/model")
        if response.get("success") is not True:
            raise RuntimeError(response.get("reason") or f"Failed to load model {model_id}")
        self._loaded_model_id = model_id
        self._running = False
        return response

    def start_autonomous(self, *, throttle_cap: float | None = None) -> None:
        self._request_json("PUT", "/api/drive_mode", payload={"drive_mode": "auto"})
        if throttle_cap is not None:
            self._request_json("PUT", "/api/max_nav_throttle", payload={"throttle": round(float(throttle_cap), 3)})
        self._request_json("PUT", "/api/start_stop", payload={"start_stop": "start"})
        self._running = True

    def stop_autonomous(self) -> None:
        self._request_json("PUT", "/api/start_stop", payload={"start_stop": "stop"})
        self._running = False

    def set_manual_drive(self) -> None:
        self._request_json("PUT", "/api/drive_mode", payload={"drive_mode": "manual"})
        self._running = False


class StockRunRecorder:
    def __init__(self, runtime: VehicleRuntime) -> None:
        self._runtime = runtime
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def _fetch_stock_frame(self):
        try:
            import requests  # type: ignore

            response = requests.get(
                "http://127.0.0.1:8080/snapshot?topic=/camera_pkg/display_mjpeg",
                timeout=2,
            )
            response.raise_for_status()
            image = Image.open(io.BytesIO(response.content)).convert("RGB")
            return np.array(image)
        except Exception:
            return None

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                frame = self._fetch_stock_frame()
                if frame is not None and self._runtime._session_logger.active:
                    self._runtime._session_logger.record(
                        frame_rgb=frame,
                        command=ControlCommand(steering=0.0, throttle=0.0),
                        control_mode="stock_autonomous",
                    )
            except Exception:
                pass
            self._stop.wait(0.25)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="stock-run-recorder", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)


class ExplorerController:
    def __init__(self, runtime: VehicleRuntime, actuator: DeepRacerActuator) -> None:
        self.runtime = runtime
        self.actuator = actuator
        self.explorer = ExplorerRuntime(self._build_config())
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._state_dir = Path("explorer_state")

    def _build_config(self) -> ExplorerConfig:
        cfg = ExplorerConfig()
        cfg.front_camera_index = int(os.getenv("VEHICLE_EXPLORER_CAMERA_DEVICE_INDEX", os.getenv("VEHICLE_PREVIEW_CAMERA_DEVICE_INDEX", "2")))
        cfg.usb_camera_index = -1
        cfg.usb_camera_auto_detect = False
        cfg.explore_throttle = 0.22
        cfg.return_throttle = 0.18
        cfg.avoid_throttle = 0.14
        cfg.target_fps = 6.0
        cfg.midas_model_path = Path(os.getenv("VEHICLE_EXPLORER_MIDAS_MODEL", "models/midas_small.onnx"))
        return cfg

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive() and self.explorer.running)

    def start(self) -> bool:
        if self.running:
            return True
        self._stop.clear()
        started = self.explorer.start()
        if not started:
            return False
        self._thread = threading.Thread(target=self._loop, name="explorer-controller", daemon=True)
        self._thread.start()
        return True

    def _loop(self) -> None:
        while not self._stop.is_set() and self.explorer.running:
            try:
                action = self.explorer.step()
                self.actuator.send(ControlCommand(steering=action.steering, throttle=action.throttle))
            except Exception:
                log.exception("Explorer controller loop failed")
                self.actuator.stop()
                try:
                    self.explorer.stop()
                except Exception:
                    pass
                break
        self.actuator.stop()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        try:
            self.explorer.stop()
        finally:
            self.actuator.stop()
            self.save_state()

    def save_state(self) -> None:
        self._state_dir.mkdir(parents=True, exist_ok=True)
        self.explorer.save_state(self._state_dir)

    def load_state(self) -> bool:
        return self.explorer.load_state(self._state_dir)

    @property
    def state_dir(self) -> Path:
        return self._state_dir

    def start_return_home(self) -> None:
        self.explorer.trigger_return()


def _init_preview_camera():
    backend = os.getenv("VEHICLE_PREVIEW_CAMERA_BACKEND", "").strip().lower()
    if not backend or backend == "disabled":
        return None
    device_index = int(os.getenv("VEHICLE_PREVIEW_CAMERA_DEVICE_INDEX", "2"))
    width = int(os.getenv("VEHICLE_PREVIEW_CAMERA_WIDTH", "640"))
    height = int(os.getenv("VEHICLE_PREVIEW_CAMERA_HEIGHT", "480"))
    return build_frame_source(
        backend=backend,
        device_index=device_index,
        width=width,
        height=height,
    )


def _clear_directory(path: Path, *, preserve: set[str] | None = None) -> None:
    preserve = preserve or set()
    path.mkdir(parents=True, exist_ok=True)
    for item in path.iterdir():
        if item.name in preserve:
            continue
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)


def _read_active_model_marker() -> dict | None:
    marker_path = _ACTIVE_MODEL_DIR / "active_model_marker.json"
    if not marker_path.exists():
        return None
    return json.loads(marker_path.read_text(encoding="utf-8"))


def _read_cached_model_marker(source_dir: Path) -> dict:
    marker_path = source_dir / "active_model_marker.json"
    if not marker_path.exists():
        return {}
    return json.loads(marker_path.read_text(encoding="utf-8"))


def _should_use_stock_runner(marker: dict) -> bool:
    model_format = str(marker.get("format", "")).strip().lower()
    return model_format in {"tensorflow-pb", "deepracer-pb", "pb"}


def _active_stock_model_id() -> str | None:
    marker = _read_active_model_marker() or {}
    if _should_use_stock_runner(marker):
        return marker.get("model_id")
    return None


def _use_bench_actuator() -> bool:
    return True


def _activate_cached_model(model_id: str) -> dict:
    source_dir = _MODEL_CACHE_DIR / model_id
    stock_runner = app.state.stock_runner
    if not source_dir.is_dir() and not stock_runner.artifact_exists(model_id):
        raise HTTPException(status_code=404, detail=f"Cached model not found: {model_id}")
    marker = _read_cached_model_marker(source_dir) if source_dir.is_dir() else {"model_id": model_id, "format": "tensorflow-pb"}
    if source_dir.is_dir():
        _clear_directory(_ACTIVE_MODEL_DIR)
        for item in source_dir.iterdir():
            dest = _ACTIVE_MODEL_DIR / item.name
            if item.is_dir():
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
    if _should_use_stock_runner(marker):
        try:
            stock_runner.activate_model(model_id, source_dir if source_dir.is_dir() else None)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Stock DeepRacer load failed: {exc}") from exc
    else:
        app.state.runtime.reload_model()
    marker = _read_active_model_marker() or {"model_id": model_id}
    return {"ok": True, "activated": marker}


def _encode_latest_frame_jpeg() -> bytes:
    global _LAST_CAMERA_JPEG
    if _PREVIEW_CAMERA_SOURCE is not None:
        try:
            frame_rgb = _PREVIEW_CAMERA_SOURCE.read_rgb()
        except Exception:
            frame_rgb = None
        if frame_rgb is not None:
            frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
            ok, encoded = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            if not ok:
                raise HTTPException(status_code=500, detail="JPEG encode failed")
            _LAST_CAMERA_JPEG = encoded.tobytes()
            return _LAST_CAMERA_JPEG

    try:
        frame_rgb = app.state.runtime.capture_frame_rgb()
    except Exception:
        frame_rgb = app.state.runtime.latest_frame_rgb()
    if frame_rgb is not None:
        frame_bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
        ok, encoded = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if not ok:
            raise HTTPException(status_code=500, detail="JPEG encode failed")
        _LAST_CAMERA_JPEG = encoded.tobytes()
        return _LAST_CAMERA_JPEG

    # Fallback to the stock DeepRacer web video server when OpenCV capture is
    # unavailable on this image. This keeps the dashboard on a single URL.
    try:
        import requests  # type: ignore

        snapshot = requests.get(
            "http://127.0.0.1:8080/snapshot?topic=/camera_pkg/display_mjpeg",
            timeout=5,
        )
        snapshot.raise_for_status()
        if snapshot.headers.get("content-type", "").startswith("image/jpeg"):
            _LAST_CAMERA_JPEG = snapshot.content
            return _LAST_CAMERA_JPEG
    except Exception as exc:
        if _LAST_CAMERA_JPEG is not None:
            return _LAST_CAMERA_JPEG
        raise HTTPException(status_code=503, detail=f"No camera frame available yet: {exc}")

    if _LAST_CAMERA_JPEG is not None:
        return _LAST_CAMERA_JPEG
    raise HTTPException(status_code=503, detail="No camera frame available yet")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/status", response_model=StatusResponse)
def status() -> StatusResponse:
    snap = app.state.runtime.snapshot()
    stock_runner = app.state.stock_runner
    loaded_model_version = snap.loaded_model_version
    target_model_version = snap.target_model_version
    running = snap.running
    control_mode = snap.control_mode if snap.control_mode in {"learned", "safe_stop", "manual_override"} else "safe_stop"
    stock_model_id = stock_runner.loaded_model_id or _active_stock_model_id()
    if stock_model_id:
        loaded_model_version = f"{stock_model_id}@stock"
        target_model_version = loaded_model_version
        if not snap.manual_override_active:
            control_mode = "learned" if stock_runner.running else "safe_stop"
        running = stock_runner.running or running
    return StatusResponse(
        running=running,
        estop=snap.estop,
        control_mode=control_mode,
        target_model_version=target_model_version,
        loaded_model_version=loaded_model_version,
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


@app.get("/camera/latest.jpg")
def camera_latest_jpg() -> Response:
    jpeg = _encode_latest_frame_jpeg()
    return Response(content=jpeg, media_type="image/jpeg")


@app.post("/camera/reset", response_model=ActionResponse)
def camera_reset() -> ActionResponse:
    global _LAST_CAMERA_JPEG, _PREVIEW_CAMERA_SOURCE
    app.state.runtime.reset_camera()
    if _PREVIEW_CAMERA_SOURCE is not None:
        try:
            _PREVIEW_CAMERA_SOURCE.close()
        except Exception:
            pass
    try:
        _PREVIEW_CAMERA_SOURCE = _init_preview_camera()
    except Exception:
        _PREVIEW_CAMERA_SOURCE = None
    _LAST_CAMERA_JPEG = None
    return ActionResponse(ok=True, message="camera reset")


@app.get("/camera/stream.mjpeg")
def camera_stream_mjpeg() -> StreamingResponse:
    boundary = "frame"

    def generate():
        while True:
            try:
                jpeg = _encode_latest_frame_jpeg()
            except HTTPException:
                time.sleep(0.1)
                continue
            yield (
                f"--{boundary}\r\n"
                "Content-Type: image/jpeg\r\n"
                f"Content-Length: {len(jpeg)}\r\n\r\n"
            ).encode("ascii") + jpeg + b"\r\n"
            time.sleep(0.1)

    return StreamingResponse(
        generate(),
        media_type=f"multipart/x-mixed-replace; boundary={boundary}",
    )


@app.post("/control/start", response_model=ActionResponse)
def start_loop() -> ActionResponse:
    stock_runner = app.state.stock_runner
    stock_model_id = stock_runner.loaded_model_id or _active_stock_model_id()
    if stock_model_id:
        if stock_runner.loaded_model_id is None:
            stock_runner._loaded_model_id = stock_model_id
        if not app.state.runtime._session_logger.active:
            app.state.runtime._session_logger.start(model_version=f"{stock_model_id}@stock")
            with app.state.runtime._lock:
                app.state.runtime._snapshot.session_active = True
                app.state.runtime._snapshot.session_id = app.state.runtime._session_logger.session_id
        stock_runner.start_autonomous(throttle_cap=app.state.runtime.config.max_throttle)
        app.state.stock_recorder.start()
        return ActionResponse(ok=True, message="stock DeepRacer autonomous driving started")
    app.state.runtime.start()
    return ActionResponse(ok=True, message="control loop started")


@app.post("/control/stop", response_model=ActionResponse)
def stop_loop() -> ActionResponse:
    stock_runner = app.state.stock_runner
    if stock_runner.loaded_model_id or _active_stock_model_id():
        app.state.stock_recorder.stop()
        stock_runner.stop_autonomous()
        app.state.runtime.stop_session(upload=False)
    app.state.runtime.stop()
    return ActionResponse(ok=True, message="autonomous driving stopped")


@app.post("/control/estop", response_model=ActionResponse)
def estop() -> ActionResponse:
    stock_runner = app.state.stock_runner
    if stock_runner.loaded_model_id or _active_stock_model_id():
        app.state.stock_recorder.stop()
        stock_runner.stop_autonomous()
        stock_runner.set_manual_drive()
        app.state.runtime.stop_session(upload=False)
    app.state.runtime.set_estop(True)
    return ActionResponse(ok=True, message="emergency stop engaged")


@app.post("/control/release-estop", response_model=ActionResponse)
def release_estop() -> ActionResponse:
    app.state.runtime.set_estop(False)
    return ActionResponse(ok=True, message="emergency stop released")


@app.post("/control/manual-override", response_model=ActionResponse)
def manual_override(payload: ManualOverrideRequest) -> ActionResponse:
    if _use_bench_actuator():
        app.state.bench_override = ControlCommand(
            steering=float(payload.steering),
            throttle=float(payload.throttle),
        )
        with app.state.runtime._lock:
            app.state.runtime._snapshot.manual_override_active = True
            app.state.runtime._snapshot.manual_override_remaining_ms = int(payload.duration_ms)
        return ActionResponse(ok=True, message=f"bench manual override armed for {payload.duration_ms}ms")
    app.state.runtime.set_manual_override(payload.steering, payload.throttle, duration_ms=payload.duration_ms)
    return ActionResponse(ok=True, message=f"manual override active for {payload.duration_ms}ms")


@app.post("/control/manual-override/clear", response_model=ActionResponse)
def clear_manual_override() -> ActionResponse:
    if _use_bench_actuator():
        app.state.bench_override = None
        app.state.bench_actuator.stop()
        with app.state.runtime._lock:
            app.state.runtime._snapshot.manual_override_active = False
            app.state.runtime._snapshot.manual_override_remaining_ms = None
        return ActionResponse(ok=True, message="bench manual override cleared")
    app.state.runtime.clear_manual_override()
    return ActionResponse(ok=True, message="manual override cleared")


@app.post("/control/step", response_model=ControlCommandPayload)
def step_once(pulse_ms: int = 350) -> ControlCommandPayload:
    if _use_bench_actuator() and app.state.bench_override is not None:
        cmd = app.state.bench_override
        app.state.bench_actuator.send(cmd)
        if pulse_ms > 0:
            time.sleep(min(max(int(pulse_ms), 1), 5000) / 1000.0)
            app.state.bench_actuator.stop()
        with app.state.runtime._lock:
            app.state.runtime._snapshot.last_steering = cmd.steering
            app.state.runtime._snapshot.last_throttle = cmd.throttle
            app.state.runtime._snapshot.manual_override_active = False
            app.state.runtime._snapshot.manual_override_remaining_ms = None
        return ControlCommandPayload(steering=cmd.steering, throttle=cmd.throttle)
    cmd = app.state.runtime.step_once()
    if pulse_ms > 0:
        time.sleep(min(max(int(pulse_ms), 1), 5000) / 1000.0)
        app.state.runtime.neutralize_output()
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
    deploy_dir = _ACTIVE_MODEL_DIR
    cache_dir = _MODEL_CACHE_DIR / (model_id or "uploaded-model")
    _clear_directory(deploy_dir)
    _clear_directory(cache_dir)

    # Write the uploaded model file
    dest = deploy_dir / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    size_bytes = dest.stat().st_size
    if file.filename.lower().endswith(".zip"):
        with zipfile.ZipFile(dest, "r") as zf:
            zf.extractall(deploy_dir)
        dest.unlink(missing_ok=True)

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
    (_ACTIVE_MODEL_DIR / "active_model_marker.json").write_text(
        json.dumps(marker, indent=2) + "\n", encoding="utf-8"
    )
    for item in deploy_dir.iterdir():
        dest_item = cache_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dest_item)
        else:
            shutil.copy2(item, dest_item)

    marker_format = str(format).strip().lower()
    if marker_format in {"tensorflow-pb", "deepracer-pb", "pb"} and model_id:
        try:
            app.state.stock_runner.activate_model(model_id, deploy_dir)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Stock DeepRacer load failed: {exc}") from exc
    else:
        app.state.runtime.reload_model()
    return {"ok": True, "filename": file.filename, "size_bytes": size_bytes}


@app.get("/model/active")
def get_active_model():
    """Return the currently deployed model info from the marker file."""
    marker = _read_active_model_marker()
    if not marker:
        return {"model_id": None, "message": "No model deployed"}
    return marker


@app.get("/model/cache")
def list_cached_models():
    _MODEL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = []
    for item in sorted(_MODEL_CACHE_DIR.iterdir()):
        if not item.is_dir():
            continue
        marker_path = item / "active_model_marker.json"
        marker = {}
        if marker_path.exists():
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
        cached.append({
            "model_id": marker.get("model_id", item.name),
            "display_name": marker.get("display_name", item.name),
            "format": marker.get("format", ""),
            "path": str(item),
        })
    return {"models": cached}


@app.post("/model/activate")
def activate_cached_model(model_id: str):
    return _activate_cached_model(model_id)


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
        success = app.state.explorer_controller.start()
        return {"success": success}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/stop")
def explorer_stop():
    """Stop the explorer."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        app.state.explorer_controller.stop()
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
        success = app.state.explorer_controller.start()
        return {"success": success, "distance_ft": distance_ft}
    except Exception as e:
        return {"error": str(e)}


@app.post("/explorer/mission/return")
def explorer_mission_return():
    """Start return-to-home mission."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"error": "Explorer not initialized"}
    try:
        app.state.explorer_controller.start_return_home()
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
        app.state.explorer_controller.save_state()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/explorer/state/load")
def explorer_state_load():
    """Load saved explorer map/trail state from disk."""
    if not hasattr(app.state.runtime, "explorer") or not app.state.runtime.explorer:
        return {"success": False, "error": "Explorer not initialized"}
    try:
        loaded = app.state.explorer_controller.load_state()
        return {
            "success": bool(loaded),
            "loaded": bool(loaded),
            "state_dir": str(app.state.explorer_controller.state_dir),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/explorer/state/files")
def explorer_state_files():
    """List saved explorer state artifacts."""
    state_dir = app.state.explorer_controller.state_dir
    files = []
    if state_dir.exists():
        for path in sorted(state_dir.iterdir()):
            if path.is_file():
                files.append({
                    "name": path.name,
                    "size_bytes": path.stat().st_size,
                    "mtime": path.stat().st_mtime,
                })
    return {"state_dir": str(state_dir), "files": files}


@app.get("/explorer/state/download/{name}")
def explorer_state_download(name: str):
    """Download a saved explorer state artifact by filename."""
    allowed = {"map.json", "map.npz", "trail.json"}
    if name not in allowed:
        raise HTTPException(status_code=404, detail="Unknown explorer state artifact")
    path = app.state.explorer_controller.state_dir / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Explorer state artifact not found")
    media_type = {
        "map.json": "application/json",
        "trail.json": "application/json",
        "map.npz": "application/octet-stream",
    }[name]
    return FileResponse(path, media_type=media_type, filename=name)


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
