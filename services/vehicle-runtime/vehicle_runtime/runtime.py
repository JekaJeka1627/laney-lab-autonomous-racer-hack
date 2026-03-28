from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from vehicle_runtime.actuators import Actuator, ControlCommand, build_actuator
from vehicle_runtime.api_client import VehicleApiClient
from vehicle_runtime.battery import (
    BatteryMonitor,
    BatterySnapshot,
    DeepRacerApiBatteryMonitor,
    MockBatteryMonitor,
)
from vehicle_runtime.config import RuntimeConfig
from vehicle_runtime.frame_sources import FrameSource, build_frame_source
from vehicle_runtime.local_model_loader import resolve_local_model
from vehicle_runtime.predictor import OnnxSteeringPredictor, SteeringPredictor, TrackModelPredictor
from vehicle_runtime.safety import SafetyPolicy
from vehicle_runtime.session_logger import RunSessionLogger, SessionArtifacts


@dataclass
class RuntimeSnapshot:
    running: bool = False
    estop: bool = False
    control_mode: str = "safe_stop"
    target_model_version: str | None = None
    loaded_model_version: str | None = None
    last_error: str | None = None
    last_steering: float | None = None
    last_throttle: float | None = None
    loop_count: int = 0
    last_model_refresh_at: float = 0.0
    battery_percent: float | None = None
    battery_voltage_v: float | None = None
    battery_state: str = "unknown"
    session_active: bool = False
    session_id: str | None = None
    last_session_artifacts_dir: str | None = None
    manual_override_active: bool = False
    manual_override_remaining_ms: int | None = None


class VehicleRuntime:
    def __init__(
        self,
        config: RuntimeConfig,
        *,
        frame_source: FrameSource | None = None,
        actuator: Actuator | None = None,
        predictor_factory=None,
        time_fn=None,
        battery_monitor: BatteryMonitor | None = None,
    ) -> None:
        self.config = config
        self._time = time_fn or time.time
        self._sleep = time.sleep
        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

        self._snapshot = RuntimeSnapshot()
        self._safety = SafetyPolicy(max_throttle=config.max_throttle, steering_scale=config.steering_scale)
        self._frame_source = frame_source or build_frame_source(
            backend=config.camera_backend,
            device_index=config.camera_device_index,
            width=config.camera_width,
            height=config.camera_height,
        )
        self._actuator = actuator or build_actuator(
            backend=config.actuator_backend,
            serial_port=config.actuator_serial_port,
            serial_baudrate=config.actuator_serial_baudrate,
            deepracer_gpio_enable=config.deepracer_gpio_enable,
            deepracer_pwm_chip=config.deepracer_pwm_chip,
            deepracer_throttle_channel=config.deepracer_throttle_channel,
            deepracer_steering_channel=config.deepracer_steering_channel,
            deepracer_throttle_neutral=config.deepracer_throttle_neutral,
            deepracer_throttle_forward=config.deepracer_throttle_forward,
            deepracer_throttle_reverse=config.deepracer_throttle_reverse,
            deepracer_steering_center=config.deepracer_steering_center,
            deepracer_steering_left=config.deepracer_steering_left,
            deepracer_steering_right=config.deepracer_steering_right,
        )
        self._predictor_factory = predictor_factory or OnnxSteeringPredictor
        self._predictor: SteeringPredictor | None = None
        self._api = VehicleApiClient(config.api_base_url) if config.api_base_url else None
        self._cache_dir = config.cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        if battery_monitor is not None:
            self._battery = battery_monitor
        elif config.battery_backend == "mock":
            self._battery = MockBatteryMonitor()
        elif config.battery_backend == "deepracer":
            self._battery = DeepRacerApiBatteryMonitor(api_url=config.deepracer_battery_api_url)
        elif config.battery_backend == "auto" and (
            config.actuator_backend == "deepracer" or config.camera_backend == "deepracer_snapshot"
        ):
            self._battery = DeepRacerApiBatteryMonitor(api_url=config.deepracer_battery_api_url)
        else:
            self._battery = MockBatteryMonitor()
        self._last_battery = BatterySnapshot(voltage_v=None, percent=None, state="unknown")
        self._session_logger = RunSessionLogger(
            cache_dir=self._cache_dir,
            user_id=config.user_id,
            track_id=config.track_id,
            sim_build=config.sim_build,
            client_build=config.client_build,
        )
        self._manual_override: ControlCommand | None = None
        self._manual_override_until: float | None = None
        self._latest_frame_rgb: Any = None
        self._active_model_dir = Path(".active-model")

    def _refresh_battery_snapshot(self) -> None:
        battery = self._battery.read()
        self._last_battery = battery
        self._snapshot.battery_percent = battery.percent
        self._snapshot.battery_voltage_v = battery.voltage_v
        self._snapshot.battery_state = battery.state

    def close(self) -> None:
        self.stop()
        self._frame_source.close()
        if self._predictor is not None and hasattr(self._predictor, "close"):
            try:
                self._predictor.close()
            except Exception:
                pass
        self._actuator.close()

    def reset_camera(self) -> None:
        with self._lock:
            try:
                self._frame_source.close()
            except Exception:
                pass
            self._frame_source = build_frame_source(
                backend=self.config.camera_backend,
                device_index=self.config.camera_device_index,
                width=self.config.camera_width,
                height=self.config.camera_height,
            )
            self._latest_frame_rgb = None

    def snapshot(self) -> RuntimeSnapshot:
        with self._lock:
            self._refresh_battery_snapshot()
            return RuntimeSnapshot(
                running=self._snapshot.running,
                estop=self._snapshot.estop,
                control_mode=self._snapshot.control_mode,
                target_model_version=self._snapshot.target_model_version,
                loaded_model_version=self._snapshot.loaded_model_version,
                last_error=self._snapshot.last_error,
                last_steering=self._snapshot.last_steering,
                last_throttle=self._snapshot.last_throttle,
                loop_count=self._snapshot.loop_count,
                last_model_refresh_at=self._snapshot.last_model_refresh_at,
                battery_percent=self._snapshot.battery_percent,
                battery_voltage_v=self._snapshot.battery_voltage_v,
                battery_state=self._snapshot.battery_state,
                session_active=self._snapshot.session_active,
                session_id=self._snapshot.session_id,
                last_session_artifacts_dir=self._snapshot.last_session_artifacts_dir,
                manual_override_active=self._snapshot.manual_override_active,
                manual_override_remaining_ms=self._snapshot.manual_override_remaining_ms,
            )

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                self._snapshot.running = True
                return
            self._start_session_if_needed()
            self._snapshot.running = True
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run_loop, name="vehicle-runtime-loop", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=2.0)
        with self._lock:
            self._snapshot.running = False
            self._snapshot.control_mode = "safe_stop"
        self._actuator.stop()
        if self.config.upload_run_on_stop:
            try:
                self.stop_session(upload=True)
            except Exception:
                pass

    def start_session(self) -> str:
        with self._lock:
            return self._start_session_if_needed()

    def stop_session(self, *, upload: bool = False) -> SessionArtifacts | None:
        artifacts = self._session_logger.stop()
        with self._lock:
            self._snapshot.session_active = False
            self._snapshot.session_id = None
            self._snapshot.last_session_artifacts_dir = str(artifacts.root_dir) if artifacts else self._snapshot.last_session_artifacts_dir
        if artifacts and upload:
            self.upload_session_artifacts(artifacts)
        return artifacts

    def upload_latest_session(self) -> bool:
        artifacts_dir = self.snapshot().last_session_artifacts_dir
        if not artifacts_dir:
            return False
        root = Path(artifacts_dir)
        artifacts = SessionArtifacts(
            session_id=root.name,
            root_dir=root,
            frames_zip_path=root / "frames.zip",
            controls_csv_path=root / "controls.csv",
            run_json_path=root / "run.json",
            frame_count=0,
            duration_s=0.0,
        )
        return self.upload_session_artifacts(artifacts)

    def upload_session_artifacts(self, artifacts: SessionArtifacts) -> bool:
        if not self._api:
            raise RuntimeError("VEHICLE_API_BASE_URL is required for run upload")
        meta = {
            "user_id": self.config.user_id,
            "track_id": self.config.track_id,
            "mode": "autonomous",
            "model_version": self.snapshot().loaded_model_version,
            "sim_build": self.config.sim_build,
            "client_build": self.config.client_build,
            "local_run_id": artifacts.session_id,
        }
        created = self._api.create_run(meta)
        run_id = created["run_id"]
        self._api.upload_run_frames(run_id, artifacts.frames_zip_path)
        self._api.upload_run_controls(run_id, artifacts.controls_csv_path)
        self._api.finalize_run(run_id, {
            "duration_s": artifacts.duration_s,
            "frame_count": artifacts.frame_count,
            "lap_count": 0,
            "off_track_count": 0,
        })
        return True

    def set_estop(self, enabled: bool) -> None:
        with self._lock:
            self._snapshot.estop = enabled
            if enabled:
                self._snapshot.control_mode = "safe_stop"
                self._manual_override = None
                self._manual_override_until = None
                self._snapshot.manual_override_active = False
                self._snapshot.manual_override_remaining_ms = None
        if enabled:
            self._actuator.stop()

    def set_manual_override(self, steering: float, throttle: float, *, duration_ms: int) -> None:
        duration_ms = max(1, min(int(duration_ms), 60_000))
        with self._lock:
            self._manual_override = ControlCommand(steering=float(steering), throttle=float(throttle))
            self._manual_override_until = self._time() + (duration_ms / 1000.0)
            self._snapshot.manual_override_active = True
            self._snapshot.manual_override_remaining_ms = duration_ms

    def clear_manual_override(self) -> None:
        with self._lock:
            self._manual_override = None
            self._manual_override_until = None
            self._snapshot.manual_override_active = False
            self._snapshot.manual_override_remaining_ms = None

    def reload_model(self) -> None:
        self._load_predictor(force=True)

    def step_once(self) -> ControlCommand:
        return self._tick()

    def neutralize_output(self) -> None:
        self._actuator.stop()

    def latest_frame_rgb(self):
        with self._lock:
            if self._latest_frame_rgb is None:
                return None
            return self._latest_frame_rgb.copy()

    def capture_frame_rgb(self):
        frame = self._frame_source.read_rgb()
        with self._lock:
            self._latest_frame_rgb = frame.copy()
        return frame.copy()

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            self._tick()
            self._sleep(max(0.001, self.config.loop_sleep_ms / 1000.0))

    def _start_session_if_needed(self) -> str:
        session_id = self._session_logger.start(model_version=self._snapshot.loaded_model_version)
        self._snapshot.session_active = True
        self._snapshot.session_id = session_id
        return session_id

    def _resolve_target_model_version(self) -> str | None:
        if self.config.pinned_model_version:
            return self.config.pinned_model_version
        if not self._api:
            return None
        return self._api.get_active_model_version()

    def _load_predictor(self, *, force: bool = False) -> None:
        with self._lock:
            now = self._time()
            if not force and (now - self._snapshot.last_model_refresh_at) < self.config.model_refresh_seconds:
                return
            self._snapshot.last_model_refresh_at = now

        try:
            local_model = resolve_local_model(self._active_model_dir)
            if local_model:
                model_format = str(local_model.get("format", "")).lower()
                model_version = str(local_model["model_version"])
                with self._lock:
                    self._snapshot.target_model_version = model_version
                if not force and self._snapshot.loaded_model_version == model_version and self._predictor is not None:
                    return

                if self._predictor is not None and hasattr(self._predictor, "close"):
                    try:
                        self._predictor.close()
                    except Exception:
                        pass

                if model_format == "onnx":
                    self._predictor = self._predictor_factory(Path(local_model["model_path"]))
                elif model_format == "tensorflow-pb":
                    self._predictor = TrackModelPredictor(
                        Path(local_model["model_dir"]),
                        model_id=str(local_model.get("model_id", "")),
                        display_name=str(local_model.get("display_name", "")),
                    )
                else:
                    raise RuntimeError(f"Unsupported local model format: {model_format}")

                with self._lock:
                    self._snapshot.loaded_model_version = model_version
                    self._snapshot.last_error = None
                return

            target_version = self._resolve_target_model_version()
            with self._lock:
                self._snapshot.target_model_version = target_version
            if not target_version:
                self._predictor = None
                with self._lock:
                    self._snapshot.loaded_model_version = None
                    self._snapshot.last_error = "No model configured (set VEHICLE_API_BASE_URL or VEHICLE_MODEL_VERSION)"
                return

            with self._lock:
                if not force and self._snapshot.loaded_model_version == target_version and self._predictor is not None:
                    return

            if self._predictor is not None and hasattr(self._predictor, "close"):
                try:
                    self._predictor.close()
                except Exception:
                    pass
            if not self._api:
                raise RuntimeError("VEHICLE_API_BASE_URL is required to download model artifacts")
            model_path = Path(self._cache_dir) / "models" / target_version / "model.onnx"
            self._api.download_model_onnx(target_version, model_path)
            self._predictor = self._predictor_factory(model_path)
            with self._lock:
                self._snapshot.loaded_model_version = target_version
                self._snapshot.last_error = None
        except Exception as exc:
            self._predictor = None
            with self._lock:
                self._snapshot.last_error = f"{type(exc).__name__}: {exc}"

    def _tick(self) -> ControlCommand:
        self._load_predictor(force=False)
        with self._lock:
            self._refresh_battery_snapshot()
            now = self._time()
            override_active = (
                self._manual_override is not None
                and self._manual_override_until is not None
                and now < self._manual_override_until
            )
            self._snapshot.manual_override_active = bool(override_active)
            self._snapshot.manual_override_remaining_ms = (
                max(0, int((self._manual_override_until - now) * 1000))
                if override_active and self._manual_override_until is not None
                else None
            )
            if not override_active:
                self._manual_override = None
                self._manual_override_until = None
                self._snapshot.manual_override_active = False
                self._snapshot.manual_override_remaining_ms = None

        with self._lock:
            estop = self._snapshot.estop
            manual_override = self._manual_override if self._snapshot.manual_override_active else None

        if estop:
            command = self._safety.apply(0.0, 0.0, estop=True)
            self._actuator.stop()
            with self._lock:
                self._snapshot.control_mode = "safe_stop"
                self._snapshot.last_steering = command.steering
                self._snapshot.last_throttle = command.throttle
                self._snapshot.loop_count += 1
            return command

        if manual_override is not None:
            command = self._safety.apply(manual_override.steering, manual_override.throttle, estop=False)
            self._actuator.send(command)
            with self._lock:
                self._snapshot.control_mode = "manual_override"
                self._snapshot.last_steering = command.steering
                self._snapshot.last_throttle = command.throttle
                self._snapshot.last_error = None
                self._snapshot.loop_count += 1
            return command

        try:
            frame = self._frame_source.read_rgb()
            with self._lock:
                self._latest_frame_rgb = frame.copy()
            if self._predictor is None:
                raise RuntimeError("Predictor not loaded")
            if hasattr(self._predictor, "predict_control"):
                steering, throttle = self._predictor.predict_control(frame)
            else:
                steering = float(self._predictor.predict_steering(frame))
                throttle = self.config.default_throttle
            command = self._safety.apply(float(steering), float(throttle), estop=False)
            control_mode = "learned"
            self._actuator.send(command)
            if self._session_logger.active:
                self._session_logger.record(frame_rgb=frame, command=command, control_mode=control_mode)
            with self._lock:
                self._snapshot.control_mode = control_mode
                self._snapshot.last_steering = command.steering
                self._snapshot.last_throttle = command.throttle
                self._snapshot.last_error = None
                self._snapshot.loop_count += 1
            return command
        except Exception as exc:
            command = self._safety.apply(0.0, 0.0, estop=True)
            self._actuator.stop()
            if 'frame' in locals() and self._session_logger.active:
                self._session_logger.record(frame_rgb=frame, command=command, control_mode="safe_stop")
            with self._lock:
                self._snapshot.control_mode = "safe_stop"
                self._snapshot.last_steering = command.steering
                self._snapshot.last_throttle = command.throttle
                self._snapshot.last_error = f"{type(exc).__name__}: {exc}"
                self._snapshot.loop_count += 1
            return command
