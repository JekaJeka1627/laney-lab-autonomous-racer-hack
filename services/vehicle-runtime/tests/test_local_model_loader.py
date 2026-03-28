from pathlib import Path

from vehicle_runtime.local_model_loader import resolve_local_model


def test_resolve_local_model_prefers_onnx(tmp_path: Path):
    model_dir = tmp_path / ".active-model"
    model_dir.mkdir()
    (model_dir / "model.pb").write_bytes(b"pb")
    (model_dir / "model.onnx").write_bytes(b"onnx")

    resolved = resolve_local_model(model_dir)

    assert resolved is not None
    assert resolved["model_path"].name == "model.onnx"
    assert resolved["format"] == "onnx"


def test_resolve_local_model_supports_pb(tmp_path: Path):
    model_dir = tmp_path / ".active-model"
    model_dir.mkdir()
    (model_dir / "model.pb").write_bytes(b"pb")

    resolved = resolve_local_model(model_dir)

    assert resolved is not None
    assert resolved["model_path"].name == "model.pb"
    assert resolved["format"] == "tensorflow-pb"
