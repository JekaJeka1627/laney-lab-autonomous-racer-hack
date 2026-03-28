from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
import json
import urllib.error
import urllib.request


class BatteryMonitor(Protocol):
    def read(self) -> "BatterySnapshot": ...


@dataclass
class BatterySnapshot:
    voltage_v: float | None
    percent: float | None
    state: str


@dataclass
class MockBatteryMonitor:
    percent: float = 100.0
    drain_per_read: float = 0.02

    def read(self) -> BatterySnapshot:
        self.percent = max(0.0, self.percent - self.drain_per_read)
        if self.percent <= 10:
            state = "critical"
        elif self.percent <= 25:
            state = "low"
        else:
            state = "normal"
        voltage = 6.0 + (self.percent / 100.0) * 2.4
        return BatterySnapshot(voltage_v=round(voltage, 2), percent=round(self.percent, 2), state=state)


@dataclass
class DeepRacerApiBatteryMonitor:
    api_url: str = "http://127.0.0.1:5001/api/get_battery_level"
    timeout_s: float = 2.0

    def read(self) -> BatterySnapshot:
        try:
            with urllib.request.urlopen(self.api_url, timeout=self.timeout_s) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            return BatterySnapshot(voltage_v=None, percent=None, state="unknown")

        level = payload.get("battery_level")
        success = payload.get("success", False)
        if not success or level is None:
            return BatterySnapshot(voltage_v=None, percent=None, state="unknown")

        try:
            level = int(level)
        except (TypeError, ValueError):
            return BatterySnapshot(voltage_v=None, percent=None, state="unknown")

        if level < 0:
            return BatterySnapshot(voltage_v=None, percent=None, state="unknown")

        # DeepRacer commonly reports battery level on a 0-5 scale.
        percent = max(0.0, min(100.0, float(level) * 20.0))
        if percent <= 10:
            state = "critical"
        elif percent <= 25:
            state = "low"
        else:
            state = "normal"
        return BatterySnapshot(voltage_v=None, percent=percent, state=state)

