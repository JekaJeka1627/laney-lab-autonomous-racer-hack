from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image


@dataclass
class TrainingOutputs:
    pytorch_path: Path | None
    onnx_path: Path | None
    metrics: dict
    mode: str  # real | placeholder


def _torch_imports():
    try:
        import torch
        from torch import nn
        from torch.utils.data import DataLoader, Dataset, random_split
        return torch, nn, DataLoader, Dataset, random_split
    except Exception as exc:
        raise RuntimeError("PyTorch is not installed in this environment.") from exc


def _iter_manifest_samples(dataset_root: Path) -> Iterable[tuple[Path, float]]:
    manifest = json.loads((dataset_root / "manifest.json").read_text(encoding="utf-8"))
    for run in manifest.get("runs", []):
        controls_csv = dataset_root / run["paths"]["controls_csv"]
        frames_root = dataset_root / run["paths"]["frames_root"]
        nested_frames_root = frames_root / "frames"
        actual_frames_root = nested_frames_root if nested_frames_root.exists() else frames_root

        with controls_csv.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                frame_idx = int(row["frame_idx"])
                steering = float(row["steering"])
                img_path = actual_frames_root / f"{frame_idx:06d}.jpg"
                if img_path.exists():
                    yield img_path, steering


def _load_image_tensor_array(img_path: Path) -> np.ndarray:
    image = Image.open(img_path).convert("RGB").resize((160, 120))
    arr = np.asarray(image, dtype=np.float32) / 255.0
    chw = np.transpose(arr, (2, 0, 1))
    return chw


def train_from_dataset_snapshot(
    dataset_root: Path,
    artifacts_dir: Path,
    *,
    epochs: int = 3,
    batch_size: int = 32,
    learning_rate: float = 3e-4,
    augment: bool = True,
) -> TrainingOutputs:
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    try:
        torch, nn, DataLoader, Dataset, random_split = _torch_imports()
    except RuntimeError:
        summary_path = artifacts_dir / "training-summary.json"
        payload = {
            "mode": "placeholder",
            "reason": "torch_not_installed",
            "dataset_root": str(dataset_root),
        }
        summary_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return TrainingOutputs(
            pytorch_path=None,
            onnx_path=summary_path,
            metrics={"train_loss": None, "val_loss": None, "note": "torch_not_installed"},
            mode="placeholder",
        )

    from trainer.model import build_driving_model

    samples = list(_iter_manifest_samples(dataset_root))
    if len(samples) < 4:
        summary_path = artifacts_dir / "training-summary.json"
        payload = {"mode": "placeholder", "reason": "not_enough_samples", "sample_count": len(samples)}
        summary_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return TrainingOutputs(
            pytorch_path=None,
            onnx_path=summary_path,
            metrics={"train_loss": None, "val_loss": None, "note": "not_enough_samples", "sample_count": len(samples)},
            mode="placeholder",
        )

    # Set up augmentation pipeline (only applied to training split)
    aug_pipeline = None
    if augment:
        from trainer.augmentation import AugmentationPipeline
        aug_pipeline = AugmentationPipeline()

    class DrivingDataset(Dataset):  # type: ignore[misc]
        def __init__(self, items: list[tuple[Path, float]], augmentation=None):
            self.items = items
            self.augmentation = augmentation

        def __len__(self):
            return len(self.items)

        def __getitem__(self, idx: int):
            img_path, steering = self.items[idx]
            x = _load_image_tensor_array(img_path)
            if self.augmentation is not None:
                x, steering = self.augmentation(x, steering)
            return torch.tensor(x, dtype=torch.float32), torch.tensor([steering], dtype=torch.float32)

    # Split indices first, then create separate datasets so augmentation
    # is only applied to training data (validation stays clean).
    all_indices = list(range(len(samples)))
    val_size = max(1, int(len(samples) * 0.2))
    train_size = len(samples) - val_size
    if train_size < 1:
        train_size, val_size = len(samples) - 1, 1

    gen = torch.Generator().manual_seed(42)
    perm = torch.randperm(len(samples), generator=gen).tolist()
    train_items = [samples[i] for i in perm[:train_size]]
    val_items = [samples[i] for i in perm[train_size:]]

    train_ds = DrivingDataset(train_items, augmentation=aug_pipeline)
    val_ds = DrivingDataset(val_items, augmentation=None)

    train_loader = DataLoader(train_ds, batch_size=min(batch_size, max(1, train_size)), shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=min(batch_size, max(1, val_size)), shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = build_driving_model().to(device)
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate, weight_decay=1e-4)

    best_val = float("inf")
    best_state = None
    train_loss_final = None
    val_loss_final = None

    for _epoch in range(epochs):
        model.train()
        train_loss_sum = 0.0
        train_batches = 0
        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)
            optimizer.zero_grad()
            pred = model(x)
            loss = criterion(pred, y)
            loss.backward()
            optimizer.step()
            train_loss_sum += float(loss.detach().cpu().item())
            train_batches += 1
        train_loss_final = train_loss_sum / max(1, train_batches)

        model.eval()
        val_loss_sum = 0.0
        val_batches = 0
        with torch.no_grad():
            for x, y in val_loader:
                x = x.to(device)
                y = y.to(device)
                pred = model(x)
                loss = criterion(pred, y)
                val_loss_sum += float(loss.detach().cpu().item())
                val_batches += 1
        val_loss_final = val_loss_sum / max(1, val_batches)

        if val_loss_final < best_val:
            best_val = val_loss_final
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)

    pytorch_path = artifacts_dir / "model.pt"
    torch.save({"state_dict": model.state_dict(), "metrics": {"train_loss": train_loss_final, "val_loss": val_loss_final}}, pytorch_path)

    # Export to ONNX format.
    # The .onnx file is used directly by the vehicle runtime for real-time
    # steering inference.  Both OpenVINO and onnxruntime can load .onnx files
    # without any conversion step.
    #
    # On the DeepRacer (Intel Atom CPU), the vehicle runtime prefers OpenVINO
    # for inference because it provides 2-3x faster execution than onnxruntime
    # by using Intel-specific optimizations:
    #   - Graph-level layer fusion (Conv+BN+ReLU merged into single ops)
    #   - Intel MKL-DNN / oneDNN kernels tuned for Atom's cache hierarchy
    #   - Vectorized SIMD instructions (SSE4.2 / AVX on supported chips)
    #   - Automatic precision selection and memory layout optimization
    #
    # The opset_version=12 is chosen for broad compatibility -- both OpenVINO
    # 2024.x and onnxruntime 1.20 support it fully.  No IR conversion (.xml/.bin)
    # is needed; OpenVINO reads .onnx directly via core.read_model().
    onnx_path = artifacts_dir / "model.onnx"
    onnx_export_error: str | None = None
    try:
        model.eval()
        dummy = torch.randn(1, 3, 120, 160, device=device)
        torch.onnx.export(
            model,
            dummy,
            onnx_path,
            input_names=["input"],
            output_names=["steering"],
            dynamic_axes={"input": {0: "batch"}, "steering": {0: "batch"}},
            opset_version=12,
            dynamo=False,
        )
    except Exception as exc:
        # Keep the trained PyTorch checkpoint even if ONNX export fails.
        onnx_export_error = f"{type(exc).__name__}: {exc}"
        onnx_path = None

    metrics = {
        "train_loss": train_loss_final,
        "val_loss": val_loss_final,
        "sample_count": len(samples),
        "train_samples": train_size,
        "val_samples": val_size,
        "augmentation": augment,
        # The exported .onnx model is compatible with both inference backends:
        #   - openvino (preferred, 2-3x faster on Intel Atom)
        #   - onnxruntime (fallback for non-Intel hardware)
        "inference_backends": ["openvino", "onnxruntime"],
    }
    if onnx_export_error:
        metrics["onnx_export_error"] = onnx_export_error

    return TrainingOutputs(
        pytorch_path=pytorch_path,
        onnx_path=onnx_path,
        metrics=metrics,
        mode="real",
    )
