"""
Model Registry CLI -- operator interface for managing models.

Usage:
    python -m model_registry.cli list [--all] [--type external|class]
    python -m model_registry.cli show <model_id>
    python -m model_registry.cli active
    python -m model_registry.cli set-active <model_id> [--operator NAME] [--note TEXT]
    python -m model_registry.cli add --name NAME --source-type external|class [OPTIONS]
    python -m model_registry.cli archive <model_id>
    python -m model_registry.cli log-eval <model_id> [OPTIONS]
    python -m model_registry.cli history [--limit N]
    python -m model_registry.cli compare [--notes]
"""
from __future__ import annotations

import argparse
import json
import sys

from model_registry.registry_core import (
    ModelEntry,
    add_model,
    archive_model,
    get_model,
    list_models,
)
from model_registry.switcher import (
    get_active_model_id,
    get_active_model_info,
    get_switch_history,
    set_active_model,
)
from model_registry.eval_logger import log_eval, get_evals_for_model
from model_registry.comparison import format_comparison_table


def cmd_list(args: argparse.Namespace) -> None:
    """List registered models."""
    models = list_models(
        include_archived=args.all,
        source_type=args.type if hasattr(args, "type") and args.type else None,
    )
    active_id = get_active_model_id()
    if not models:
        print("No models registered.")
        return

    print(f"{'':>2} {'ID':<10} {'Name':<30} {'Type':<10} {'Format':<8} {'Status':<10} {'Version'}")
    print("-" * 85)
    for m in models:
        marker = ">>" if m.id == active_id else "  "
        print(
            f"{marker} {m.id:<10} {m.display_name[:29]:<30} {m.source_type:<10} "
            f"{m.format:<8} {m.status:<10} {m.version}"
        )
    print(f"\n{len(models)} model(s). Active: {active_id or 'none'}")


def cmd_show(args: argparse.Namespace) -> None:
    """Show details for a specific model."""
    entry = get_model(args.model_id)
    if not entry:
        print(f"Model '{args.model_id}' not found.")
        sys.exit(1)

    active_id = get_active_model_id()
    is_active = " [ACTIVE]" if entry.id == active_id else ""

    print(f"Model: {entry.display_name}{is_active}")
    print(f"  ID:           {entry.id}")
    print(f"  Source:       {entry.source_type}")
    print(f"  Format:       {entry.format}")
    print(f"  Version:      {entry.version}")
    print(f"  Status:       {entry.status}")
    print(f"  Author:       {entry.author}")
    print(f"  Team:         {entry.team}")
    print(f"  Trained for:  {entry.trained_for}")
    print(f"  Date added:   {entry.date_added}")
    print(f"  Local path:   {entry.local_path or 'n/a'}")
    print(f"  Remote path:  {entry.remote_path or 'n/a'}")
    print(f"  Source notes: {entry.source_notes}")
    print(f"  Notes:        {entry.notes}")
    if entry.tags:
        print(f"  Tags:         {', '.join(entry.tags)}")

    # Show eval summary if any
    evals = get_evals_for_model(entry.id)
    if evals:
        print(f"\n  Eval runs: {len(evals)}")
        for ev in evals[-5:]:
            print(
                f"    {ev['timestamp']}  laps={ev['lap_count']}  "
                f"OT={ev['off_track_count']}  status={ev['completion_status']}  "
                f"{ev.get('notes', '')}"
            )


def cmd_active(args: argparse.Namespace) -> None:
    """Show the currently active model."""
    info = get_active_model_info()
    if not info:
        print("No active model set.")
        return
    print(json.dumps(info, indent=2))


def cmd_set_active(args: argparse.Namespace) -> None:
    """Set the active model."""
    try:
        result = set_active_model(
            args.model_id,
            operator=args.operator or "",
            note=args.note or "",
            deploy=not args.no_deploy,
        )
        print(json.dumps(result, indent=2))
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)


def cmd_add(args: argparse.Namespace) -> None:
    """Register a new model."""
    entry = ModelEntry(
        id=args.id or "",
        display_name=args.name,
        source_type=args.source_type,
        source_notes=args.source_notes or "",
        local_path=args.local_path or "",
        remote_path=args.remote_path or "",
        format=args.format or "onnx",
        version=args.version or "1",
        trained_for=args.trained_for or "",
        author=args.author or "",
        team=args.team or "",
        status=args.status or "ready",
        notes=args.notes or "",
        tags=[t.strip() for t in args.tags.split(",")] if args.tags else [],
    )
    try:
        result = add_model(entry)
        print(f"Registered model: {result.id} -- {result.display_name}")
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)


def cmd_archive(args: argparse.Namespace) -> None:
    """Archive a model."""
    try:
        result = archive_model(args.model_id)
        print(f"Archived: {result.id} -- {result.display_name}")
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)


def cmd_log_eval(args: argparse.Namespace) -> None:
    """Log a physical evaluation run."""
    entry = log_eval(
        model_id=args.model_id,
        track=args.track or "",
        lap_count=args.laps or 0,
        completion_status=args.completion or "",
        off_track_count=args.off_track or 0,
        crash_count=args.crashes or 0,
        avg_speed=args.speed,
        operator=args.operator or "",
        notes=args.notes or "",
    )
    print(f"Logged eval: {entry['eval_id']} for model {args.model_id}")
    print(json.dumps(entry, indent=2))


def cmd_history(args: argparse.Namespace) -> None:
    """Show model switch history."""
    entries = get_switch_history(limit=args.limit)
    if not entries:
        print("No switch history.")
        return
    for e in entries:
        prev = e.get("previous_model_id") or "none"
        print(
            f"  {e['timestamp']}  {prev} -> {e['model_id']}  "
            f"by={e.get('operator', '')}  {e.get('note', '')}"
        )


def cmd_compare(args: argparse.Namespace) -> None:
    """Compare model performance from eval logs."""
    print(format_comparison_table(include_notes=args.notes))


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="model-registry",
        description="DeepRacer Model Registry and Switcher CLI",
    )
    sub = parser.add_subparsers(dest="command")

    # list
    p_list = sub.add_parser("list", help="List registered models")
    p_list.add_argument("--all", action="store_true", help="Include archived models")
    p_list.add_argument("--type", choices=["external", "class"], help="Filter by source type")

    # show
    p_show = sub.add_parser("show", help="Show model details")
    p_show.add_argument("model_id", help="Model ID")

    # active
    sub.add_parser("active", help="Show currently active model")

    # set-active
    p_set = sub.add_parser("set-active", help="Set the active model")
    p_set.add_argument("model_id", help="Model ID to activate")
    p_set.add_argument("--operator", help="Operator name")
    p_set.add_argument("--note", help="Switch note")
    p_set.add_argument("--no-deploy", action="store_true", help="Skip file deployment")

    # add
    p_add = sub.add_parser("add", help="Register a new model")
    p_add.add_argument("--id", help="Custom model ID (auto-generated if omitted)")
    p_add.add_argument("--name", required=True, help="Display name")
    p_add.add_argument("--source-type", required=True, choices=["external", "class"])
    p_add.add_argument("--source-notes", help="Where the model came from")
    p_add.add_argument("--local-path", help="Path to model file(s)")
    p_add.add_argument("--remote-path", help="Remote URL or S3 path")
    p_add.add_argument("--format", default="onnx", help="Model format (default: onnx)")
    p_add.add_argument("--version", default="1", help="Version string")
    p_add.add_argument("--trained-for", help="What track/environment the model was trained for")
    p_add.add_argument("--author", help="Author name")
    p_add.add_argument("--team", help="Team name")
    p_add.add_argument("--status", default="ready", choices=["ready", "testing", "archived"])
    p_add.add_argument("--notes", help="Additional notes")
    p_add.add_argument("--tags", help="Comma-separated tags")

    # archive
    p_archive = sub.add_parser("archive", help="Archive a model")
    p_archive.add_argument("model_id", help="Model ID")

    # log-eval
    p_eval = sub.add_parser("log-eval", help="Log a physical evaluation run")
    p_eval.add_argument("model_id", help="Model ID that was tested")
    p_eval.add_argument("--track", help="Track or location name")
    p_eval.add_argument("--laps", type=int, help="Number of laps completed")
    p_eval.add_argument("--completion", help="Completion status (e.g. full, partial, dnf)")
    p_eval.add_argument("--off-track", type=int, default=0, help="Off-track event count")
    p_eval.add_argument("--crashes", type=int, default=0, help="Crash count")
    p_eval.add_argument("--speed", type=float, help="Average speed")
    p_eval.add_argument("--operator", help="Operator/student name")
    p_eval.add_argument("--notes", help="Run notes")

    # history
    p_hist = sub.add_parser("history", help="Show model switch history")
    p_hist.add_argument("--limit", type=int, default=20, help="Number of entries")

    # compare
    p_cmp = sub.add_parser("compare", help="Compare model performance")
    p_cmp.add_argument("--notes", action="store_true", help="Include run notes")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(0)

    commands = {
        "list": cmd_list,
        "show": cmd_show,
        "active": cmd_active,
        "set-active": cmd_set_active,
        "add": cmd_add,
        "archive": cmd_archive,
        "log-eval": cmd_log_eval,
        "history": cmd_history,
        "compare": cmd_compare,
    }
    commands[args.command](args)


if __name__ == "__main__":
    main()
