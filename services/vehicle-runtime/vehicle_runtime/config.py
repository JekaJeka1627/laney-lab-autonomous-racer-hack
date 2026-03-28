from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class RuntimeConfig:
    api_base_url: str | None
    pinned_model_version: str | None
    battery_backend: str
    deepracer_battery_api_url: str
    camera_backend: str
    actuator_backend: str
    actuator_serial_port: str | None
    actuator_serial_baudrate: int
    deepracer_gpio_enable: int
    deepracer_pwm_chip: int
    deepracer_throttle_channel: int
    deepracer_steering_channel: int
    deepracer_throttle_neutral: int
    deepracer_throttle_forward: int
    deepracer_throttle_reverse: int
    deepracer_steering_center: int
    deepracer_steering_left: int
    deepracer_steering_right: int
    camera_device_index: int
    camera_width: int
    camera_height: int
    frame_interval_ms: int
    default_throttle: float
    max_throttle: float
    steering_scale: float
    model_refresh_seconds: float
    loop_sleep_ms: int
    stale_frame_timeout_ms: int
    cache_dir: Path
    autostart: bool
    user_id: str
    track_id: str
    sim_build: str
    client_build: str
    upload_run_on_stop: bool


def load_config() -> RuntimeConfig:
    return RuntimeConfig(
        api_base_url=os.getenv("VEHICLE_API_BASE_URL"),
        pinned_model_version=os.getenv("VEHICLE_MODEL_VERSION"),
        battery_backend=os.getenv("VEHICLE_BATTERY_BACKEND", "auto").strip().lower(),
        deepracer_battery_api_url=os.getenv("VEHICLE_DEEPRACER_BATTERY_API_URL", "http://127.0.0.1:5001/api/get_battery_level").strip(),
        camera_backend=os.getenv("VEHICLE_CAMERA_BACKEND", "mock").strip().lower(),
        actuator_backend=os.getenv("VEHICLE_ACTUATOR_BACKEND", "mock").strip().lower(),
        actuator_serial_port=os.getenv("VEHICLE_ACTUATOR_SERIAL_PORT"),
        actuator_serial_baudrate=int(os.getenv("VEHICLE_ACTUATOR_SERIAL_BAUDRATE", "115200")),
        deepracer_gpio_enable=int(os.getenv("VEHICLE_DEEPRACER_GPIO_ENABLE", "436")),
        deepracer_pwm_chip=int(os.getenv("VEHICLE_DEEPRACER_PWM_CHIP", "0")),
        deepracer_throttle_channel=int(os.getenv("VEHICLE_DEEPRACER_THROTTLE_CHANNEL", "0")),
        deepracer_steering_channel=int(os.getenv("VEHICLE_DEEPRACER_STEERING_CHANNEL", "1")),
        deepracer_throttle_neutral=int(os.getenv("VEHICLE_DEEPRACER_THROTTLE_NEUTRAL", "1446000")),
        deepracer_throttle_forward=int(os.getenv("VEHICLE_DEEPRACER_THROTTLE_FORWARD", "1554000")),
        deepracer_throttle_reverse=int(os.getenv("VEHICLE_DEEPRACER_THROTTLE_REVERSE", "1338000")),
        deepracer_steering_center=int(os.getenv("VEHICLE_DEEPRACER_STEERING_CENTER", "1450000")),
        deepracer_steering_left=int(os.getenv("VEHICLE_DEEPRACER_STEERING_LEFT", "1290000")),
        deepracer_steering_right=int(os.getenv("VEHICLE_DEEPRACER_STEERING_RIGHT", "1710000")),
        camera_device_index=int(os.getenv("VEHICLE_CAMERA_DEVICE_INDEX", "0")),
        camera_width=int(os.getenv("VEHICLE_CAMERA_WIDTH", "160")),
        camera_height=int(os.getenv("VEHICLE_CAMERA_HEIGHT", "120")),
        frame_interval_ms=int(os.getenv("VEHICLE_FRAME_INTERVAL_MS", "100")),
        default_throttle=float(os.getenv("VEHICLE_DEFAULT_THROTTLE", "0.35")),
        max_throttle=float(os.getenv("VEHICLE_MAX_THROTTLE", "0.45")),
        steering_scale=float(os.getenv("VEHICLE_STEERING_SCALE", "1.0")),
        model_refresh_seconds=float(os.getenv("VEHICLE_MODEL_REFRESH_SECONDS", "30")),
        loop_sleep_ms=int(os.getenv("VEHICLE_LOOP_SLEEP_MS", "50")),
        stale_frame_timeout_ms=int(os.getenv("VEHICLE_STALE_FRAME_TIMEOUT_MS", "750")),
        cache_dir=Path(os.getenv("VEHICLE_CACHE_DIR", ".vehicle-runtime-cache")),
        autostart=_env_bool("VEHICLE_AUTOSTART", False),
        user_id=os.getenv("VEHICLE_USER_ID", "vehicle-runtime"),
        track_id=os.getenv("VEHICLE_TRACK_ID", "physical-track"),
        sim_build=os.getenv("VEHICLE_SIM_BUILD", "physical-runtime"),
        client_build=os.getenv("VEHICLE_CLIENT_BUILD", "vehicle-runtime"),
        upload_run_on_stop=_env_bool("VEHICLE_UPLOAD_RUN_ON_STOP", False),
    )
