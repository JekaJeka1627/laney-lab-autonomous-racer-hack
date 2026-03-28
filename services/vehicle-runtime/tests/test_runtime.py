from dataclasses import dataclass
from pathlib import Path

import numpy as np

from vehicle_runtime.actuators import MockActuator
from vehicle_runtime.config import RuntimeConfig
from vehicle_runtime.runtime import VehicleRuntime


@dataclass
class StubFrameSource:
    calls: int = 0

    def read_rgb(self):
        self.calls += 1
        return np.zeros((120, 160, 3), dtype=np.uint8)

    def close(self):
        return None


class StubPredictor:
    def __init__(self, _path):
        pass

    def predict_steering(self, frame_rgb):
        assert frame_rgb.shape == (120, 160, 3)
        return 0.25


def build_config() -> RuntimeConfig:
    return RuntimeConfig(
        api_base_url=None,
        pinned_model_version=None,
        camera_backend="mock",
        actuator_backend="mock",
        actuator_serial_port=None,
        actuator_serial_baudrate=115200,
        camera_device_index=0,
        camera_width=160,
        camera_height=120,
        frame_interval_ms=100,
        default_throttle=0.35,
        max_throttle=0.4,
        steering_scale=1.0,
        model_refresh_seconds=30.0,
        loop_sleep_ms=50,
        stale_frame_timeout_ms=750,
        cache_dir=Path(".vehicle-runtime-test-cache"),
        local_model_dir=Path(".active-model"),
        autostart=False,
        user_id="vehicle-test",
        track_id="physical-track",
        sim_build="physical-runtime",
        client_build="vehicle-runtime",
        upload_run_on_stop=False,
    )


def test_runtime_safe_stops_without_model():
    actuator = MockActuator()
    runtime = VehicleRuntime(build_config(), frame_source=StubFrameSource(), actuator=actuator)
    cmd = runtime.step_once()
    assert cmd.throttle == 0.0
    assert cmd.steering == 0.0
    snap = runtime.snapshot()
    assert snap.control_mode == "safe_stop"
    assert snap.last_error is not None
    assert snap.battery_state in {"normal", "low", "critical"}
    runtime.close()


def test_runtime_uses_predictor_when_pinned_model_configured(tmp_path):
    actuator = MockActuator()
    cfg = build_config()
    cfg.pinned_model_version = "vtest"
    cfg.api_base_url = "http://example.invalid"
    cfg.cache_dir = tmp_path

    class StubApi:
        def download_model_onnx(self, model_version, out_path):
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(b"fake")
            return out_path

        def get_active_model_version(self):
            return "vignored"

    runtime = VehicleRuntime(
        cfg,
        frame_source=StubFrameSource(),
        actuator=actuator,
        predictor_factory=StubPredictor,
    )
    runtime._api = StubApi()  # inject fake API client
    cmd = runtime.step_once()
    assert cmd.steering == 0.25
    assert cmd.throttle == 0.35
    snap = runtime.snapshot()
    assert snap.loaded_model_version == "vtest"
    assert snap.control_mode == "learned"
    runtime.close()


def test_runtime_session_start_stop_exports_artifacts(tmp_path):
    actuator = MockActuator()
    cfg = build_config()
    cfg.pinned_model_version = "vtest"
    cfg.api_base_url = "http://example.invalid"
    cfg.cache_dir = tmp_path

    class StubApi:
        def download_model_onnx(self, model_version, out_path):
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(b"fake")
            return out_path

        def get_active_model_version(self):
            return "vignored"

    runtime = VehicleRuntime(
        cfg,
        frame_source=StubFrameSource(),
        actuator=actuator,
        predictor_factory=StubPredictor,
    )
    runtime._api = StubApi()
    sid = runtime.start_session()
    assert sid
    runtime.step_once()
    artifacts = runtime.stop_session(upload=False)
    assert artifacts is not None
    assert artifacts.frames_zip_path.exists()
    assert artifacts.controls_csv_path.exists()
    snap = runtime.snapshot()
    assert snap.session_active is False
    assert snap.last_session_artifacts_dir is not None
    runtime.close()


def test_manual_override_takes_precedence_over_learned(tmp_path):
    actuator = MockActuator()
    cfg = build_config()
    cfg.pinned_model_version = "vtest"
    cfg.api_base_url = "http://example.invalid"
    cfg.cache_dir = tmp_path

    class StubApi:
        def download_model_onnx(self, model_version, out_path):
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(b"fake")
            return out_path

        def get_active_model_version(self):
            return "vignored"

    fake_now = {"t": 1000.0}

    runtime = VehicleRuntime(
        cfg,
        frame_source=StubFrameSource(),
        actuator=actuator,
        predictor_factory=StubPredictor,
        time_fn=lambda: fake_now["t"],
    )
    runtime._api = StubApi()
    runtime.set_manual_override(steering=-0.5, throttle=0.9, duration_ms=500)
    cmd = runtime.step_once()
    assert cmd.steering == -0.5
    assert cmd.throttle == 0.4  # safety clamp
    snap = runtime.snapshot()
    assert snap.control_mode == "manual_override"
    assert snap.manual_override_active is True
    runtime.close()


def test_manual_override_expires_and_learned_resumes(tmp_path):
    actuator = MockActuator()
    cfg = build_config()
    cfg.pinned_model_version = "vtest"
    cfg.api_base_url = "http://example.invalid"
    cfg.cache_dir = tmp_path

    class StubApi:
        def download_model_onnx(self, model_version, out_path):
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(b"fake")
            return out_path

        def get_active_model_version(self):
            return "vignored"

    fake_now = {"t": 1000.0}
    runtime = VehicleRuntime(
        cfg,
        frame_source=StubFrameSource(),
        actuator=actuator,
        predictor_factory=StubPredictor,
        time_fn=lambda: fake_now["t"],
    )
    runtime._api = StubApi()
    runtime.set_manual_override(steering=-0.5, throttle=0.2, duration_ms=100)
    cmd1 = runtime.step_once()
    assert cmd1.steering == -0.5
    fake_now["t"] += 0.2
    cmd2 = runtime.step_once()
    assert cmd2.steering == 0.25
    snap = runtime.snapshot()
    assert snap.control_mode == "learned"
    assert snap.manual_override_active is False
    runtime.close()
