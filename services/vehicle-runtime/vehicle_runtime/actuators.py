from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol


@dataclass
class ControlCommand:
    steering: float
    throttle: float


class Actuator(Protocol):
    def send(self, command: ControlCommand) -> None: ...
    def stop(self) -> None: ...
    def close(self) -> None: ...


@dataclass
class MockActuator:
    history: list[ControlCommand] = field(default_factory=list)

    def send(self, command: ControlCommand) -> None:
        self.history.append(command)

    def stop(self) -> None:
        self.history.append(ControlCommand(steering=0.0, throttle=0.0))

    def close(self) -> None:
        return None


class StdoutActuator:
    def send(self, command: ControlCommand) -> None:  # pragma: no cover - io
        print(f"[actuator] steering={command.steering:+.3f} throttle={command.throttle:.3f}")

    def stop(self) -> None:  # pragma: no cover - io
        print("[actuator] STOP")

    def close(self) -> None:  # pragma: no cover - io
        return None


class SerialLineActuator:
    """Sends newline-delimited JSON commands to a serial-connected controller.

    The controller firmware can parse lines like:
      {"type":"control","steering":0.12,"throttle":0.30}
      {"type":"stop"}
    """

    def __init__(
        self,
        *,
        port: str,
        baudrate: int = 115200,
        serial_factory=None,
        neutral_on_connect: bool = True,
    ):
        if not port:
            raise ValueError("Serial actuator port is required")
        if serial_factory is None:
            try:
                import serial  # type: ignore
            except Exception as exc:  # pragma: no cover - env dependent
                raise RuntimeError("pyserial is required for serial actuator backend.") from exc
            serial_factory = serial.Serial
        self._ser = serial_factory(port=port, baudrate=baudrate, timeout=1)
        if neutral_on_connect:
            self.stop()

    def _write_json_line(self, payload: dict) -> None:
        line = (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")
        self._ser.write(line)
        flush = getattr(self._ser, "flush", None)
        if callable(flush):
            flush()

    def send(self, command: ControlCommand) -> None:
        self._write_json_line({
            "type": "control",
            "steering": round(float(command.steering), 6),
            "throttle": round(float(command.throttle), 6),
        })

    def stop(self) -> None:
        self._write_json_line({"type": "stop"})

    def close(self) -> None:
        close = getattr(self._ser, "close", None)
        if callable(close):
            close()


class DeepRacerPwmActuator:
    """Direct PWM/GPIO control for the DeepRacer vehicle."""

    def __init__(
        self,
        *,
        pwm_chip: int,
        throttle_channel: int,
        steering_channel: int,
        gpio_enable: int,
        throttle_neutral: int,
        throttle_forward: int,
        throttle_reverse: int,
        steering_center: int,
        steering_left: int,
        steering_right: int,
        sysfs_root: str | Path = "/sys/class",
    ):
        self._sysfs_root = Path(sysfs_root)
        self._throttle_path = self._resolve_pwm_path(pwm_chip, throttle_channel)
        self._steering_path = self._resolve_pwm_path(pwm_chip, steering_channel)
        self._gpio_value_path = self._sysfs_root / "gpio" / f"gpio{gpio_enable}" / "value"
        self._throttle_neutral = int(throttle_neutral)
        self._throttle_forward = int(throttle_forward)
        self._throttle_reverse = int(throttle_reverse)
        self._steering_center = int(steering_center)
        self._steering_left = int(steering_left)
        self._steering_right = int(steering_right)
        self._last_command = ControlCommand(steering=0.0, throttle=0.0)
        self._set_enabled(True)
        self.stop()

    def _resolve_pwm_path(self, chip: int, channel: int) -> Path:
        path = self._sysfs_root / "pwm" / f"pwmchip{chip}" / f"pwm{channel}" / "duty_cycle"
        if not path.exists():
            raise RuntimeError(f"DeepRacer PWM path not found: {path}")
        return path

    def _write_int(self, path: Path, value: int) -> None:
        path.write_text(f"{int(value)}\n", encoding="ascii")

    def _set_enabled(self, enabled: bool) -> None:
        if self._gpio_value_path.exists():
            self._write_int(self._gpio_value_path, 1 if enabled else 0)

    @staticmethod
    def _clamp_unit(value: float) -> float:
        return max(-1.0, min(1.0, float(value)))

    @staticmethod
    def _lerp(a: int, b: int, fraction: float) -> int:
        return int(round(a + (b - a) * fraction))

    def _map_steering(self, steering: float) -> int:
        steering = self._clamp_unit(steering)
        if steering >= 0.0:
            return self._lerp(self._steering_center, self._steering_right, steering)
        return self._lerp(self._steering_center, self._steering_left, abs(steering))

    def _map_throttle(self, throttle: float) -> int:
        throttle = self._clamp_unit(throttle)
        if throttle >= 0.0:
            return self._lerp(self._throttle_neutral, self._throttle_forward, throttle)
        return self._lerp(self._throttle_neutral, self._throttle_reverse, abs(throttle))

    def send(self, command: ControlCommand) -> None:
        steering_pwm = self._map_steering(command.steering)
        throttle_pwm = self._map_throttle(command.throttle)
        self._set_enabled(True)
        self._write_int(self._steering_path, steering_pwm)
        self._write_int(self._throttle_path, throttle_pwm)
        self._last_command = command

    def stop(self) -> None:
        self._set_enabled(True)
        self._write_int(self._steering_path, self._steering_center)
        self._write_int(self._throttle_path, self._throttle_neutral)
        self._last_command = ControlCommand(steering=0.0, throttle=0.0)

    def close(self) -> None:
        self.stop()


class DeepRacerActuator:
    """Control the DeepRacer through the proven calibration API path.

    This uses the same webserver endpoints that moved the hardware during
    manual debugging, rather than writing raw sysfs PWM values directly.
    """

    def __init__(
        self,
        *,
        base_url: str = "https://127.0.0.1",
        token_path: str | Path = "/opt/aws/deepracer/token.txt",
        verify_tls: bool = False,
    ):
        try:
            import requests  # type: ignore
            import urllib3  # type: ignore
        except Exception as exc:  # pragma: no cover - env dependent
            raise RuntimeError("requests is required for deepracer actuator backend.") from exc

        self._requests = requests
        if not verify_tls:
            urllib3.disable_warnings()  # pragma: no cover - environment dependent
        self._base_url = base_url.rstrip("/")
        self._verify_tls = verify_tls
        self._token_path = Path(token_path)
        self._session = requests.Session()
        self._session.verify = verify_tls
        self._session.headers.update({"Referer": f"{self._base_url}/"})
        self._angle_cal = {"mid": 0.0, "min": -150.0, "max": 150.0}
        self._throttle_cal = {"mid": 0.0, "min": -20.0, "max": 20.0}
        self._epsilon = 1e-6
        self._calibration_mode_ready = False
        self._configure_session()
        self._ensure_calibration_mode()
        self._refresh_calibration()
        self.stop()

    def _configure_session(self) -> None:
        token = self._token_path.read_text(encoding="utf-8").strip()
        self._session.cookies.set("deepracer_token", token)
        response = self._session.get(f"{self._base_url}/")
        response.raise_for_status()
        match = (
            re.search(r'name="csrf_token"[^>]*value="([^"]+)"', response.text)
            or re.search(r'<meta name="csrf-token" content="([^"]+)"', response.text)
        )
        if not match:
            raise RuntimeError("Unable to locate DeepRacer CSRF token")
        self._session.headers.update({"X-CSRFToken": match.group(1)})

    def _request_json(self, method: str, path: str, payload: dict | None = None) -> dict:
        response = self._session.request(method, f"{self._base_url}{path}", json=payload)
        response.raise_for_status()
        data = response.json()
        if data.get("success") is False:
            raise RuntimeError(f"DeepRacer API {path} failed: {data}")
        return data

    def _ensure_calibration_mode(self) -> None:
        if self._calibration_mode_ready:
            return
        self._request_json("GET", "/api/set_calibration_mode")
        self._calibration_mode_ready = True

    def _refresh_calibration(self) -> None:
        angle = self._request_json("GET", "/api/get_calibration/angle")
        throttle = self._request_json("GET", "/api/get_calibration/throttle")
        self._angle_cal = {
            "mid": float(angle["mid"]),
            "min": float(angle["min"]),
            "max": float(angle["max"]),
        }
        self._throttle_cal = {
            "mid": float(throttle["mid"]),
            "min": float(throttle["min"]),
            "max": float(throttle["max"]),
        }

    @staticmethod
    def _clamp_unit(value: float) -> float:
        return max(-1.0, min(1.0, float(value)))

    @staticmethod
    def _lerp(start: float, end: float, fraction: float) -> float:
        return start + (end - start) * fraction

    def _map_calibration(self, value: float, calibration: dict) -> int:
        value = self._clamp_unit(value)
        mid = float(calibration["mid"])
        if value >= 0.0:
            mapped = self._lerp(mid, float(calibration["max"]), value)
        else:
            mapped = self._lerp(mid, float(calibration["min"]), abs(value))
        return int(round(mapped))

    def _map_throttle_calibration(self, value: float) -> int:
        value = self._clamp_unit(value)
        mid = int(round(self._throttle_cal["mid"]))
        forward = int(round(self._throttle_cal["max"]))
        reverse = int(round(self._throttle_cal["min"]))
        magnitude = abs(value)
        if magnitude <= 0.05:
            return mid
        if value > 0.0:
            if magnitude < 0.35:
                return int(round((mid + forward) / 2.0))
            return forward
        if magnitude < 0.35:
            return int(round((mid + reverse) / 2.0))
        return reverse

    def send(self, command: ControlCommand) -> None:
        try:
            self._ensure_calibration_mode()
            steering_active = abs(command.steering) > self._epsilon
            throttle_active = abs(command.throttle) > self._epsilon

            if steering_active or not throttle_active:
                angle_pwm = self._map_calibration(command.steering, self._angle_cal)
                self._request_json("POST", "/api/adjust_calibrating_wheels/angle", {"pwm": angle_pwm})
            throttle_pwm = (
                self._map_throttle_calibration(command.throttle)
                if throttle_active
                else int(round(self._throttle_cal["mid"]))
            )
            self._request_json("POST", "/api/adjust_calibrating_wheels/throttle", {"pwm": throttle_pwm})
        except Exception:
            self._calibration_mode_ready = False
            raise

    def stop(self) -> None:
        try:
            self._ensure_calibration_mode()
            self._request_json("POST", "/api/adjust_calibrating_wheels/angle", {"pwm": int(round(self._angle_cal["mid"]))})
            self._request_json("POST", "/api/adjust_calibrating_wheels/throttle", {"pwm": int(round(self._throttle_cal["mid"]))})
        except Exception:
            self._calibration_mode_ready = False
            raise

    def close(self) -> None:
        try:
            self.stop()
        except Exception:
            return None


def build_actuator(
    *,
    backend: str,
    serial_port: str | None = None,
    serial_baudrate: int = 115200,
    deepracer_gpio_enable: int = 436,
    deepracer_pwm_chip: int = 0,
    deepracer_throttle_channel: int = 0,
    deepracer_steering_channel: int = 1,
    deepracer_throttle_neutral: int = 1446000,
    deepracer_throttle_forward: int = 1554000,
    deepracer_throttle_reverse: int = 1338000,
    deepracer_steering_center: int = 1450000,
    deepracer_steering_left: int = 1290000,
    deepracer_steering_right: int = 1710000,
) -> Actuator:
    if backend == "mock":
        return MockActuator()
    if backend == "stdout":
        return StdoutActuator()
    if backend == "serial":
        return SerialLineActuator(port=serial_port or "", baudrate=serial_baudrate)
    if backend == "deepracer_pwm":
        return DeepRacerPwmActuator(
            pwm_chip=deepracer_pwm_chip,
            throttle_channel=deepracer_throttle_channel,
            steering_channel=deepracer_steering_channel,
            gpio_enable=deepracer_gpio_enable,
            throttle_neutral=deepracer_throttle_neutral,
            throttle_forward=deepracer_throttle_forward,
            throttle_reverse=deepracer_throttle_reverse,
            steering_center=deepracer_steering_center,
            steering_left=deepracer_steering_left,
            steering_right=deepracer_steering_right,
        )
    if backend == "deepracer":
        return DeepRacerActuator()
    raise ValueError(f"Unsupported actuator backend: {backend}")
