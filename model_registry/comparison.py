"""
Comparison View -- aggregate and compare model performance from eval logs.

Provides CLI-friendly summary tables and per-model stats.
"""
from __future__ import annotations

from collections import defaultdict

from model_registry.eval_logger import load_eval_log
from model_registry.registry_core import get_model


def aggregate_by_model() -> dict[str, dict]:
    """
    Aggregate evaluation stats grouped by model_id.

    Returns a dict keyed by model_id with:
      - display_name
      - source_type
      - run_count
      - total_laps
      - avg_laps
      - avg_off_track
      - avg_crash
      - avg_speed (if data available)
      - completion_rates (counts by status)
      - notes (list of all notes)
    """
    entries = load_eval_log()
    groups: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        groups[e["model_id"]].append(e)

    results = {}
    for model_id, runs in groups.items():
        model = get_model(model_id)
        run_count = len(runs)
        total_laps = sum(r.get("lap_count", 0) for r in runs)
        total_off_track = sum(r.get("off_track_count", 0) for r in runs)
        total_crashes = sum(r.get("crash_count", 0) for r in runs)

        speeds = [r["avg_speed"] for r in runs if r.get("avg_speed") is not None]
        avg_speed = sum(speeds) / len(speeds) if speeds else None

        # Completion status breakdown
        completion_counts: dict[str, int] = defaultdict(int)
        for r in runs:
            status = r.get("completion_status", "unknown") or "unknown"
            completion_counts[status] += 1

        all_notes = [r["notes"] for r in runs if r.get("notes")]

        results[model_id] = {
            "display_name": model.display_name if model else model_id,
            "source_type": model.source_type if model else "unknown",
            "run_count": run_count,
            "total_laps": total_laps,
            "avg_laps": round(total_laps / run_count, 1) if run_count else 0,
            "avg_off_track": round(total_off_track / run_count, 1) if run_count else 0,
            "avg_crash": round(total_crashes / run_count, 1) if run_count else 0,
            "avg_speed": round(avg_speed, 2) if avg_speed is not None else None,
            "completion_rates": dict(completion_counts),
            "notes": all_notes,
        }

    return results


def format_comparison_table(include_notes: bool = False) -> str:
    """
    Return a formatted text table comparing all models with eval data.
    """
    stats = aggregate_by_model()
    if not stats:
        return "No evaluation data found. Log some runs first."

    lines = []
    header = (
        f"{'Model':<25} {'Type':<9} {'Runs':>5} {'Laps':>5} "
        f"{'Avg Laps':>9} {'Avg OT':>7} {'Avg Crash':>10} {'Avg Spd':>8}"
    )
    lines.append(header)
    lines.append("-" * len(header))

    for model_id, s in sorted(stats.items(), key=lambda x: x[1]["run_count"], reverse=True):
        name = s["display_name"][:24]
        spd = f"{s['avg_speed']:.1f}" if s["avg_speed"] is not None else "n/a"
        lines.append(
            f"{name:<25} {s['source_type']:<9} {s['run_count']:>5} "
            f"{s['total_laps']:>5} {s['avg_laps']:>9.1f} "
            f"{s['avg_off_track']:>7.1f} {s['avg_crash']:>10.1f} {spd:>8}"
        )

        if include_notes and s["notes"]:
            for note in s["notes"][-3:]:
                lines.append(f"  >> {note}")

    return "\n".join(lines)
