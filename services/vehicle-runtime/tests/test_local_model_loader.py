from pathlib import Path

from vehicle_runtime.local_model_loader import resolve_local_model


def test_resolve_local_model_supports_tensorflow_pb(tmp_path: Path):
    model_dir = tmp_path / ".active-model"
    agent_dir = model_dir / "agent"
    agent_dir.mkdir(parents=True)
    (agent_dir / "model.pb").write_bytes(b"fake-pb")
    (model_dir / "model_metadata.json").write_text("{}", encoding="utf-8")
    (model_dir / "active_model_marker.json").write_text(
        '{"model_id":"center-align","display_name":"Center Align","format":"tensorflow-pb","version":"1","deployed_at":"now"}',
        encoding="utf-8",
    )

    resolved = resolve_local_model(model_dir)
    assert resolved is not None
    assert resolved["format"] == "tensorflow-pb"
    assert Path(resolved["model_path"]).name == "model.pb"
    assert Path(resolved["model_dir"]) == model_dir
