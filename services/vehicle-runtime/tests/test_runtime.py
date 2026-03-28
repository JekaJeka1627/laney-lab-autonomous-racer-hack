from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from vehicle_runtime.actuators import MockActuator
from vehicle_runtime.config import RuntimeConfig
from vehicle_runtime.frame_sources import SnapshotHttpFrameSource
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
        battery_backend="mock",
        deepracer_battery_api_url="http://127.0.0.1:5001/api/get_battery_level",
        camera_backend="mock",
        actuator_backend="mock",
        actuator_serial_port=None,
        actuator_serial_baudrate=115200,
        deepracer_gpio_enable=436,
        deepracer_pwm_chip=0,
        deepracer_throttle_channel=0,
        deepracer_steering_channel=1,
        deepracer_throttle_neutral=1446000,
        deepracer_throttle_forward=1554000,
        deepracer_throttle_reverse=1338000,
        deepracer_steering_center=1450000,
        deepracer_steering_left=1290000,
        deepracer_steering_right=1710000,
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


def test_runtime_exposes_latest_frame_copy():
    actuator = MockActuator()
    runtime = VehicleRuntime(build_config(), frame_source=StubFrameSource(), actuator=actuator)
    runtime.step_once()
    frame = runtime.latest_frame_rgb()
    assert frame is not None
    assert frame.shape == (120, 160, 3)
    frame[0, 0, 0] = 255
    fresh = runtime.latest_frame_rgb()
    assert fresh[0, 0, 0] == 0
    runtime.close()


def test_runtime_neutralize_output_stops_actuator():
    actuator = MockActuator()
    runtime = VehicleRuntime(build_config(), frame_source=StubFrameSource(), actuator=actuator)
    runtime.neutralize_output()
    assert actuator.history[-1].steering == 0.0
    assert actuator.history[-1].throttle == 0.0
    runtime.close()


def test_runtime_uses_local_track_model_predictor(monkeypatch, tmp_path):
    actuator = MockActuator()
    cfg = build_config()
    cfg.cache_dir = tmp_path

    import vehicle_runtime.runtime as runtime_mod

    class StubTrackPredictor:
        def __init__(self, model_dir, *, model_id="", display_name=""):
            self.model_dir = model_dir

        def predict_control(self, frame_rgb):
            return (-0.4, 0.3)

        def close(self):
            return None

    monkeypatch.setattr(
        runtime_mod,
        "resolve_local_model",
        lambda _path: {
            "model_path": tmp_path / "agent" / "model.pb",
            "model_dir": tmp_path,
            "format": "tensorflow-pb",
            "model_id": "center-align",
            "model_version": "center-align@1",
            "display_name": "Center Align",
        },
    )
    monkeypatch.setattr(runtime_mod, "TrackModelPredictor", StubTrackPredictor)

    runtime = VehicleRuntime(
        cfg,
        frame_source=StubFrameSource(),
        actuator=actuator,
        predictor_factory=StubPredictor,
    )
    cmd = runtime.step_once()
    assert cmd.steering == -0.4
    assert cmd.throttle == 0.3
    snap = runtime.snapshot()
    assert snap.loaded_model_version == "center-align@1"
    assert snap.control_mode == "learned"
    runtime.close()


def test_snapshot_http_frame_source_caches_last_good_frame(monkeypatch):
    image = Image.new("RGB", (8, 6), color=(10, 20, 30))
    buf = BytesIO()
    image.save(buf, format="JPEG")
    jpeg = buf.getvalue()

    class FakeResponse:
        def __init__(self, content: bytes):
            self.content = content

        def raise_for_status(self):
            return None

    class FakeRequests:
        def __init__(self):
            self.calls = 0

        def get(self, url, timeout):
            self.calls += 1
            if self.calls == 1:
                return FakeResponse(jpeg)
            raise RuntimeError("boom")

    fake_requests = FakeRequests()
    monkeypatch.setitem(__import__("sys").modules, "requests", fake_requests)

    source = SnapshotHttpFrameSource("http://camera.invalid/snapshot.jpg", width=8, height=6)
    first = source.read_rgb()
    second = source.read_rgb()
    assert first.shape == (6, 8, 3)
    assert np.array_equal(first, second)


def test_ffmpeg_frame_source_caches_last_good_frame(monkeypatch):
    from vehicle_runtime.frame_sources import FfmpegFrameSource

    image = Image.new("RGB", (8, 6), color=(1, 2, 3))
    buf = BytesIO()
    image.save(buf, format="JPEG")
    jpeg = buf.getvalue()

    calls = {"count": 0}

    class Result:
        def __init__(self, stdout: bytes):
            self.stdout = stdout

    def fake_run(cmd, check, capture_output, timeout):
        calls["count"] += 1
        if calls["count"] == 1:
            return Result(jpeg)
        raise RuntimeError("ffmpeg failed")

    monkeypatch.setattr("vehicle_runtime.frame_sources.subprocess.run", fake_run)

    source = FfmpegFrameSource(device_index=1, width=8, height=6)
    first = source.read_rgb()
    second = source.read_rgb()
    assert first.shape == (6, 8, 3)
    assert np.array_equal(first, second)
