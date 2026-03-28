import json
from pathlib import Path

from vehicle_runtime.actuators import (
    ControlCommand,
    DeepRacerActuator,
    DeepRacerPwmActuator,
    SerialLineActuator,
    build_actuator,
)


def _write(path: Path, value: str = "0\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="ascii")


class FakeSerialPort:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.writes: list[bytes] = []
        self.closed = False

    def write(self, data: bytes):
        self.writes.append(data)
        return len(data)

    def flush(self):
        return None

    def close(self):
        self.closed = True


def test_serial_line_actuator_writes_json_lines():
    created = {}

    def fake_factory(**kwargs):
        created["port"] = FakeSerialPort(**kwargs)
        return created["port"]

    actuator = SerialLineActuator(port="COM7", baudrate=57600, serial_factory=fake_factory, neutral_on_connect=False)
    actuator.send(ControlCommand(steering=0.125, throttle=0.3))
    actuator.stop()
    actuator.close()

    port = created["port"]
    assert port.kwargs["port"] == "COM7"
    assert port.kwargs["baudrate"] == 57600
    first = json.loads(port.writes[0].decode("utf-8"))
    second = json.loads(port.writes[1].decode("utf-8"))
    assert first == {"type": "control", "steering": 0.125, "throttle": 0.3}
    assert second == {"type": "stop"}
    assert port.closed is True


def test_build_actuator_supports_mock_stdout_and_deepracer_pwm(tmp_path):
    assert build_actuator(backend="mock").__class__.__name__ == "MockActuator"
    assert build_actuator(backend="stdout").__class__.__name__ == "StdoutActuator"

    _write(tmp_path / "pwm" / "pwmchip0" / "pwm0" / "duty_cycle")
    _write(tmp_path / "pwm" / "pwmchip0" / "pwm1" / "duty_cycle")
    _write(tmp_path / "gpio" / "gpio436" / "value")
    actuator = DeepRacerPwmActuator(
        pwm_chip=0,
        throttle_channel=0,
        steering_channel=1,
        gpio_enable=436,
        throttle_neutral=1446000,
        throttle_forward=1554000,
        throttle_reverse=1338000,
        steering_center=1450000,
        steering_left=1290000,
        steering_right=1710000,
        sysfs_root=tmp_path,
    )
    actuator.close()


def test_deepracer_pwm_actuator_maps_pwm_and_stop(tmp_path):
    sysfs_root = tmp_path
    throttle = sysfs_root / "pwm" / "pwmchip0" / "pwm0" / "duty_cycle"
    steering = sysfs_root / "pwm" / "pwmchip0" / "pwm1" / "duty_cycle"
    gpio = sysfs_root / "gpio" / "gpio436" / "value"
    _write(throttle)
    _write(steering)
    _write(gpio)

    actuator = DeepRacerPwmActuator(
        pwm_chip=0,
        throttle_channel=0,
        steering_channel=1,
        gpio_enable=436,
        throttle_neutral=1446000,
        throttle_forward=1554000,
        throttle_reverse=1338000,
        steering_center=1450000,
        steering_left=1290000,
        steering_right=1710000,
        sysfs_root=sysfs_root,
    )

    actuator.send(ControlCommand(steering=0.5, throttle=0.5))
    assert gpio.read_text(encoding="ascii").strip() == "1"
    assert steering.read_text(encoding="ascii").strip() == "1580000"
    assert throttle.read_text(encoding="ascii").strip() == "1500000"

    actuator.send(ControlCommand(steering=-1.0, throttle=-1.0))
    assert steering.read_text(encoding="ascii").strip() == "1290000"
    assert throttle.read_text(encoding="ascii").strip() == "1338000"

    actuator.stop()
    assert steering.read_text(encoding="ascii").strip() == "1450000"
    assert throttle.read_text(encoding="ascii").strip() == "1446000"


class FakeResponse:
    def __init__(self, *, text="", data=None, status_code=200):
        self.text = text
        self._data = data or {}
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")

    def json(self):
        return self._data


class FakeSession:
    def __init__(self):
        self.verify = False
        self.headers = {}
        self.cookies = self
        self.calls = []

    def set(self, key, value):
        self.headers[f"cookie:{key}"] = value

    def get(self, url):
        self.calls.append(("GET", url, None))
        if url.endswith("/"):
            return FakeResponse(text='<input name="csrf_token" value="csrf123">')
        if url.endswith("/api/set_calibration_mode"):
            return FakeResponse(data={"success": True})
        if url.endswith("/api/get_calibration/angle"):
            return FakeResponse(data={"mid": 0, "min": -20, "max": 20, "success": True})
        if url.endswith("/api/get_calibration/throttle"):
            return FakeResponse(data={"mid": -12, "min": 12, "max": -36, "success": True})
        raise AssertionError(url)

    def request(self, method, url, json=None):
        self.calls.append((method, url, json))
        if method == "GET" and url.endswith("/api/get_calibration/angle"):
            return FakeResponse(data={"mid": 0, "min": -20, "max": 20, "success": True})
        if method == "GET" and url.endswith("/api/get_calibration/throttle"):
            return FakeResponse(data={"mid": -12, "min": 12, "max": -36, "success": True})
        if url.endswith("/api/adjust_calibrating_wheels/angle"):
            return FakeResponse(data={"success": True})
        if url.endswith("/api/adjust_calibrating_wheels/throttle"):
            return FakeResponse(data={"success": True})
        if url.endswith("/api/set_calibration_mode"):
            return FakeResponse(data={"success": True})
        raise AssertionError((method, url, json))


def test_deepracer_api_actuator_uses_calibration_requests(monkeypatch, tmp_path):
    token_path = tmp_path / "token.txt"
    token_path.write_text("abc123\n", encoding="utf-8")
    session = FakeSession()

    class FakeRequestsModule:
        class Session:
            def __new__(cls):
                return session

    class FakeUrllib3Module:
        @staticmethod
        def disable_warnings():
            return None

    import sys
    monkeypatch.setitem(sys.modules, "requests", FakeRequestsModule())
    monkeypatch.setitem(sys.modules, "urllib3", FakeUrllib3Module())

    actuator = DeepRacerActuator(base_url="https://127.0.0.1", token_path=token_path, verify_tls=False)
    actuator.send(ControlCommand(steering=0.5, throttle=0.5))
    actuator.send(ControlCommand(steering=0.5, throttle=0.0))
    actuator.stop()

    writes = [call for call in session.calls if "/api/adjust_calibrating_wheels/" in call[1]]
    assert writes[0][2] == {"pwm": 0}
    assert writes[1][2] == {"pwm": -12}
    assert writes[2][2] == {"pwm": 10}
    assert writes[3][2] == {"pwm": -36}
    assert writes[4][2] == {"pwm": 10}
    assert writes[5][2] == {"pwm": -12}
    assert writes[6][2] == {"pwm": 0}
    assert writes[7][2] == {"pwm": -12}
