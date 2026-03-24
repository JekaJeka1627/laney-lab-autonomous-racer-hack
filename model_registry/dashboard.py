"""
Model Registry Dashboard -- Streamlit UI for browsing, switching, and comparing models.

Run:
    streamlit run model_registry/dashboard.py
"""
from __future__ import annotations
import json
import logging
import math
import os
import random
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path
import streamlit as st

# Ensure model_registry is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model_registry.registry_core import ModelEntry, list_models, get_model, load_registry
from model_registry.switcher import (
    get_active_model_id,
    get_active_model_info,
    get_switch_history,
    set_active_model,
    VEHICLE_RUNTIME_URL,
)
from model_registry.eval_logger import load_eval_log, get_evals_for_model
from model_registry.comparison import aggregate_by_model

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="DeepRacer Model Registry",
    page_icon="",
    layout="wide",
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_runtime_status() -> dict | None:
    """Try to fetch vehicle runtime status."""
    try:
        req = urllib.request.Request(f"{VEHICLE_RUNTIME_URL}/status", method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def format_action_space(model: ModelEntry) -> str:
    """Extract action space type from source notes."""
    notes = model.source_notes.lower()
    if "continuous" in notes:
        return "Continuous"
    if "discrete" in notes:
        return "Discrete"
    return "N/A"


# ---------------------------------------------------------------------------
# Sidebar -- Model Selector
# ---------------------------------------------------------------------------

st.sidebar.title("Model Registry")

active_id = get_active_model_id()
models = list_models(include_archived=False)

if not models:
    st.sidebar.warning("No models registered.")
    st.stop()

model_options = {m.id: f"{m.display_name} ({m.source_type})" for m in models}

# Show active model prominently
if active_id and active_id in model_options:
    st.sidebar.success(f"Active: {model_options[active_id]}")
else:
    st.sidebar.info("No active model set")

selected_id = st.sidebar.selectbox(
    "Select a model",
    options=list(model_options.keys()),
    format_func=lambda x: model_options[x],
    index=list(model_options.keys()).index(active_id) if active_id in model_options else 0,
)

# Set Active button
if selected_id != active_id:
    operator = st.sidebar.text_input("Your name (optional)", key="operator_name")
    note = st.sidebar.text_input("Switch note (optional)", key="switch_note")
    if st.sidebar.button("Set as Active Model", type="primary", use_container_width=True):
        try:
            result = set_active_model(
                selected_id,
                operator=operator,
                note=note,
            )
            if result.get("status") == "switched":
                runtime_msg = " Runtime notified." if result.get("runtime_notified") else ""
                st.sidebar.success(f"Switched to {selected_id}.{runtime_msg}")
                st.rerun()
            else:
                st.sidebar.info(result.get("message", "No change"))
        except ValueError as e:
            st.sidebar.error(str(e))
else:
    st.sidebar.caption("This model is currently active.")

# Model details expander
if selected_id:
    model = get_model(selected_id)
    if model:
        with st.sidebar.expander("📋 Model Details", expanded=False):
            # Basic info
            st.markdown(f"### {model.display_name}")
            st.markdown(f"**ID:** `{model.id}`")
            st.markdown(f"**Source:** {model.source_type}")
            st.markdown(f"**Status:** {model.status}")
            st.markdown(f"**Version:** {model.version}")
            
            # Simple description based on what we know
            st.markdown("---")
            st.markdown("**What it does:**")
            if model.trained_for:
                st.markdown(f"Trained for: {model.trained_for}")
            else:
                st.markdown("Autonomous driving model for the DeepRacer vehicle")
            
            # Usage scenarios
            st.markdown("**When to use it:**")
            if model.source_type == "class":
                st.markdown("• Classroom demonstration and learning")
                st.markdown("• Testing autonomous driving concepts")
                st.markdown("• Educational purposes")
            else:
                st.markdown("• Production racing scenarios")
                st.markdown("• Performance testing")
                st.markdown("• Competition environments")
            
            # Technical details
            st.markdown("---")
            st.markdown("**Technical Details:**")
            st.markdown(f"• **Format:** {model.format.upper()}")
            
            # Author/Team info
            if model.author:
                st.markdown(f"• **Author:** {model.author}")
            if model.team:
                st.markdown(f"• **Team:** {model.team}")
            
            # Model file info
            if model.local_path:
                try:
                    model_path = Path(model.local_path)
                    if model_path.exists():
                        size_mb = model_path.stat().st_size / (1024 * 1024)
                        st.markdown(f"• **Model Size:** {size_mb:.1f} MB")
                        st.markdown(f"• **File:** `{model_path.name}`")
                except Exception:
                    st.markdown(f"• **Path:** `{model.local_path}`")
            
            if model.remote_path:
                st.markdown(f"• **Remote:** `{model.remote_path}`")
            
            # Additional info
            if model.source_notes:
                st.markdown(f"• **Notes:** {model.source_notes}")
            
            # Creation info
            st.markdown("---")
            st.markdown("**Added:**")
            if model.date_added:
                try:
                    if isinstance(model.date_added, str):
                        created_dt = datetime.fromisoformat(model.date_added.replace('Z', '+00:00'))
                        st.markdown(f"• {created_dt.strftime('%Y-%m-%d %H:%M')}")
                except Exception:
                    st.markdown(f"• {model.date_added}")
            else:
                st.markdown("• Unknown")
            
            # Tags
            if model.tags:
                st.markdown("**Tags:**")
                tags_str = " ".join([f"`{tag}`" for tag in model.tags[:5]])
                if len(model.tags) > 5:
                    tags_str += f" +{len(model.tags)-5} more"
                st.markdown(tags_str)
            
            # Evaluation metrics (if available)
            evals = get_evals_for_model(selected_id)
            if evals:
                st.markdown("---")
                st.markdown("**Recent Evaluations:**")
                # Show latest 3 evaluations
                for eval in evals[:3]:
                    eval_time = eval.get("timestamp", "")[:16] if eval.get("timestamp") else "Unknown"
                    st.markdown(f"• **{eval_time}**")
                    if "metrics" in eval:
                        for metric, value in eval["metrics"].items():
                            if isinstance(value, float):
                                st.markdown(f"  - {metric}: {value:.3f}")
                            else:
                                st.markdown(f"  - {metric}: {value}")
                    if eval.get("notes"):
                        st.markdown(f"  - *{eval['notes']}*")

# Vehicle runtime status
st.sidebar.markdown("---")
st.sidebar.subheader("Vehicle Runtime")
runtime = get_runtime_status()
if runtime:
    mode = runtime.get("control_mode", "unknown")
    model_ver = runtime.get("loaded_model_version", "none")
    loop = runtime.get("loop_count", 0)

    mode_colors = {"learned": "green", "safe_stop": "orange", "manual_override": "blue"}
    color = mode_colors.get(mode, "gray")

    st.sidebar.markdown(f"Status: **:{color}[{mode}]**")
    st.sidebar.caption(f"Loaded: {model_ver}")
    st.sidebar.caption(f"Loop count: {loop}")

    if runtime.get("last_error"):
        st.sidebar.error(runtime["last_error"])

    col1, col2 = st.sidebar.columns(2)
    if col1.button("Reload Model", use_container_width=True):
        try:
            req = urllib.request.Request(f"{VEHICLE_RUNTIME_URL}/model/reload", method="POST", data=b"")
            urllib.request.urlopen(req, timeout=3)
            st.sidebar.success("Reload triggered")
            st.rerun()
        except Exception:
            st.sidebar.error("Failed to reach runtime")
    if col2.button("E-Stop", use_container_width=True):
        try:
            req = urllib.request.Request(f"{VEHICLE_RUNTIME_URL}/control/estop", method="POST", data=b"")
            urllib.request.urlopen(req, timeout=3)
            st.sidebar.warning("E-STOP engaged")
            st.rerun()
        except Exception:
            st.sidebar.error("Failed to reach runtime")
else:
    st.sidebar.caption("Runtime not reachable")
    st.sidebar.caption(f"Expected at: {VEHICLE_RUNTIME_URL}")


# ---------------------------------------------------------------------------
# Main content -- Tabs
# ---------------------------------------------------------------------------

tab_details, tab_compare, tab_premap, tab_explorer, tab_history, tab_all = st.tabs([
    "Model Details", "Performance Comparison", "Pre-Mapping", "Explorer Controls", "Switch History", "All Models"
])

# ---------------------------------------------------------------------------
# Tab: Model Details
# ---------------------------------------------------------------------------
with tab_details:
    model = get_model(selected_id)
    if not model:
        st.error(f"Model '{selected_id}' not found")
    else:
        is_active = selected_id == active_id

        col_title, col_badge = st.columns([4, 1])
        with col_title:
            st.header(model.display_name)
        with col_badge:
            if is_active:
                st.markdown("")
                st.success("ACTIVE")

        # Key info cards
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Source", model.source_type.title())
        c2.metric("Format", model.format.upper())
        c3.metric("Action Space", format_action_space(model))
        c4.metric("Status", model.status.title())

        st.markdown("---")

        col_left, col_right = st.columns(2)

        with col_left:
            st.subheader("Details")
            details = {
                "ID": model.id,
                "Version": model.version,
                "Author": model.author or "N/A",
                "Team": model.team or "N/A",
                "Trained For": model.trained_for or "N/A",
                "Date Added": model.date_added or "N/A",
                "Local Path": model.local_path or "N/A",
            }
            for k, v in details.items():
                st.markdown(f"**{k}:** {v}")

            if model.source_notes:
                st.markdown("**Source Notes:**")
                st.caption(model.source_notes)

            if model.notes:
                st.markdown("**Notes:**")
                st.caption(model.notes)

            if model.tags:
                st.markdown("**Tags:** " + ", ".join(f"`{t}`" for t in model.tags))

        with col_right:
            st.subheader("Evaluation Runs")
            evals = get_evals_for_model(selected_id)
            if evals:
                eval_data = []
                for e in evals:
                    eval_data.append({
                        "Date": e.get("timestamp", "")[:10],
                        "Track": e.get("track", ""),
                        "Laps": e.get("lap_count", 0),
                        "Off-Track": e.get("off_track_count", 0),
                        "Crashes": e.get("crash_count", 0),
                        "Avg Speed": e.get("avg_speed") or "",
                        "Status": e.get("completion_status", ""),
                        "Operator": e.get("operator", ""),
                        "Notes": e.get("notes", ""),
                    })
                st.dataframe(eval_data, use_container_width=True)
            else:
                st.info("No evaluation runs logged for this model yet.")
                st.caption(
                    "Log a run with: `python -m model_registry.cli log-eval "
                    f"{selected_id} --laps 3 --completion full --track lab`"
                )

# ---------------------------------------------------------------------------
# Tab: Performance Comparison
# ---------------------------------------------------------------------------
with tab_compare:
    st.header("Model Performance Comparison")

    stats = aggregate_by_model()
    if not stats:
        st.info("No evaluation data yet. Log some runs to see comparisons here.")
        st.code(
            "python -m model_registry.cli log-eval <model_id> "
            "--laps 3 --completion full --off-track 2 --speed 1.5 --track lab",
            language="bash",
        )
    else:
        # Summary table
        summary_rows = []
        for mid, s in stats.items():
            summary_rows.append({
                "Model": s["display_name"],
                "Type": s["source_type"],
                "Runs": s["run_count"],
                "Total Laps": s["total_laps"],
                "Avg Laps/Run": s["avg_laps"],
                "Avg Off-Track": s["avg_off_track"],
                "Avg Crashes": s["avg_crash"],
                "Avg Speed (m/s)": s["avg_speed"] if s["avg_speed"] is not None else "",
            })

        st.dataframe(summary_rows, use_container_width=True)

        # Charts
        if len(stats) >= 2:
            import pandas as pd

            df = pd.DataFrame(summary_rows)

            st.markdown("---")
            chart_col1, chart_col2 = st.columns(2)

            with chart_col1:
                st.subheader("Runs per Model")
                chart_df = df.set_index("Model")[["Runs"]]
                st.bar_chart(chart_df)

            with chart_col2:
                st.subheader("Avg Off-Track Events")
                chart_df = df.set_index("Model")[["Avg Off-Track"]]
                st.bar_chart(chart_df)

            chart_col3, chart_col4 = st.columns(2)

            with chart_col3:
                st.subheader("Avg Laps per Run")
                chart_df = df.set_index("Model")[["Avg Laps/Run"]]
                st.bar_chart(chart_df)

            with chart_col4:
                speed_df = df[df["Avg Speed (m/s)"] != ""].copy()
                if not speed_df.empty:
                    st.subheader("Avg Speed (m/s)")
                    chart_df = speed_df.set_index("Model")[["Avg Speed (m/s)"]]
                    st.bar_chart(chart_df)
                else:
                    st.subheader("Avg Crashes")
                    chart_df = df.set_index("Model")[["Avg Crashes"]]
                    st.bar_chart(chart_df)

        # Completion status breakdown
        st.markdown("---")
        st.subheader("Completion Status Breakdown")
        for mid, s in stats.items():
            rates = s.get("completion_rates", {})
            if rates:
                cols = st.columns([2] + [1] * len(rates))
                cols[0].markdown(f"**{s['display_name']}**")
                for i, (status, count) in enumerate(rates.items()):
                    cols[i + 1].metric(status.title(), count)

# ---------------------------------------------------------------------------
# Tab: Pre-Mapping
# ---------------------------------------------------------------------------
with tab_premap:
    st.header("Area Pre-Mapping")
    st.caption(
        "Help the racer understand the area before exploration. "
        "Upload photos and annotate obstacles, free zones, and points of interest."
    )
    
    # Check pre-mapping status
    try:
        req = urllib.request.Request(f"{VEHICLE_RUNTIME_URL}/explorer/premap/status", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            premap_status = json.loads(resp.read().decode())
    except Exception:
        premap_status = {"has_premap": False, "photos": []}
    
    # Initialize or load pre-mapping session
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.subheader("Photo Upload")
        
        uploaded_file = st.file_uploader(
            "Upload a photo of the area",
            type=['jpg', 'jpeg', 'png'],
            help="Take photos from different angles to create a complete map"
        )
        
        if uploaded_file:
            # Position inputs
            pos_col1, pos_col2, pos_col3 = st.columns(3)
            with pos_col1:
                pos_x = st.number_input("X Position (ft)", value=0.0, step=1.0)
            with pos_col2:
                pos_y = st.number_input("Y Position (ft)", value=0.0, step=1.0)
            with pos_col3:
                heading = st.number_input("Heading (degrees)", value=0.0, step=15.0)
            
            if st.button("Upload Photo", type="primary"):
                files = {"file": uploaded_file.getvalue()}
                # Note: Streamlit doesn't support multipart form upload directly
                # This would need a custom component or different approach
                st.info("Photo upload requires API integration. See documentation for manual upload.")
        
        st.markdown("---")
        st.subheader("Photo Guidelines")
        st.markdown("""
        **For best results:**
        - Take photos from different angles (every 45-90 degrees)
        - Keep consistent height (about 2-3 feet from ground)
        - Overlap photos by 30-50%
        - Include reference points in multiple photos
        - Good lighting helps with obstacle detection
        """)
    
    with col2:
        st.subheader("Session Status")
        
        if premap_status.get("has_premap"):
            st.success(f"Active Session")
            st.metric("Photos", premap_status.get("num_photos", 0))
            
            if premap_status.get("has_composite"):
                st.success("Composite Map Ready")
            else:
                st.info("No Composite Map")
            
            if premap_status.get("has_prior"):
                st.success("Prior Map Generated")
            else:
                st.info("No Prior Map")
            
            # Show photos list
            if premap_status.get("photos"):
                st.markdown("**Uploaded Photos:**")
                for photo in premap_status["photos"][:5]:
                    st.markdown(f"• {photo['filename']} ({photo['num_annotations']} annotations)")
        else:
            st.info("No active pre-mapping session")
            
            if st.button("Start New Session"):
                try:
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/premap/load",
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        result = json.loads(resp.read().decode())
                        if result.get("success"):
                            st.success("Session started")
                            st.rerun()
                except Exception:
                    st.error("Failed to start session")
    
    # Show composite map if available
    if premap_status.get("has_composite"):
        st.markdown("---")
        st.subheader("Composite Map")
        try:
            req = urllib.request.Request(f"{VEHICLE_RUNTIME_URL}/explorer/premap/composite", method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                img_data = resp.read()
                st.image(img_data, caption="Stitched photo composite", use_container_width=True)
        except Exception:
            st.error("Failed to load composite map")
    
    # Annotation tools
    if premap_status.get("photos"):
        st.markdown("---")
        st.subheader("Annotation Tools")
        
        col1, col2 = st.columns([1, 1])
        
        with col1:
            st.markdown("**Quick Labels:**")
            if st.button("Mark as Obstacle"):
                st.info("Click on the photo to mark obstacles")
            if st.button("Mark as Free Space"):
                st.info("Click on the photo to mark free areas")
            if st.button("Mark as Wall"):
                st.info("Click to mark walls/barriers")
        
        with col2:
            st.markdown("**Special Features:**")
            if st.button("Mark Door/Entrance"):
                st.info("Mark potential entrances")
            if st.button("Mark Hazard"):
                st.info("Mark dangerous areas")
            if st.button("Add Note"):
                st.info("Add custom notes to areas")
        
        st.markdown("---")
        st.subheader("Processing")
        
        proc_col1, proc_col2, proc_col3 = st.columns(3)
        
        with proc_col1:
            if st.button("🧵 Stitch Photos"):
                try:
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/premap/stitch",
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        result = json.loads(resp.read().decode())
                        if result.get("success"):
                            st.success(result.get("message"))
                        else:
                            st.error(result.get("error"))
                except Exception:
                    st.error("Stitching failed")
        
        with proc_col2:
            if st.button("🗺️ Create Prior Map"):
                try:
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/premap/prior",
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        result = json.loads(resp.read().decode())
                        if result.get("success"):
                            st.success(result.get("message"))
                        else:
                            st.error(result.get("error"))
                except Exception:
                    st.error("Failed to create prior map")
        
        with proc_col3:
            if st.button("💾 Save Session"):
                try:
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/premap/save",
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=3) as resp:
                        result = json.loads(resp.read().decode())
                        if result.get("success"):
                            st.success("Session saved")
                        else:
                            st.error(result.get("error"))
                except Exception:
                    st.error("Save failed")
    
    # Exploration hints
    if premap_status.get("hints"):
        st.markdown("---")
        st.subheader("Exploration Hints")
        st.caption("Based on your annotations, here are areas the racer should prioritize:")
        
        for hint in premap_status["hints"][:5]:
            icon = {"avoid": "🚫", "explore": "✅", "investigate": "🔍"}.get(hint.get("type"), "📍")
            priority_color = {
                "high": "red",
                "medium": "orange", 
                "low": "green"
            }.get(hint.get("priority"), "gray")
            
            st.markdown(f"{icon} **{hint.get('type', 'unknown').title()}** at ({hint.get('position', [0, 0])[0]:.1f}, {hint.get('position', [0, 0])[1]:.1f})")
            st.caption(f"_{hint.get('reason', 'No reason')}_")
            st.markdown(f":{priority_color}[Priority: {hint.get('priority', 'unknown')}]")
            st.markdown("---")
    
    # Mobile app instructions
    with st.expander("📱 Mobile App Instructions", expanded=False):
        st.markdown("""
        **Using the Mobile App for Pre-Mapping:**
        
        1. **Download the app** from the app store (coming soon)
        2. **Connect to the racer's WiFi** network
        3. **Walk around the area** and take photos:
           - Hold phone at waist height (2-3 ft from ground)
           - Take a photo every 10-15 steps
           - Turn 45 degrees after each photo
           - Get 360° coverage of the area
        4. **Tap to annotate** directly on photos:
           - Red = Obstacles (chairs, walls, equipment)
           - Green = Free space (clear paths)
           - Blue = Special areas (doors, ramps, hazards)
        5. **Review and submit** - the app will stitch photos and create the prior map
        6. **Start exploration** - the racer will use your annotated map
        
        **Tips:**
        - Good lighting makes obstacle detection easier
        - Include floor patterns in multiple photos for better stitching
        - Mark temporary obstacles with lower confidence
        - Add notes for anything unusual (e.g., "wet floor", "loose cable")
        """)

# ---------------------------------------------------------------------------
# Tab: Explorer Controls
# ---------------------------------------------------------------------------
with tab_explorer:
    st.header("Visual Explorer Controls")
    st.caption(
        "Control the Visual Explorer model -- autonomous navigation with "
        "obstacle avoidance and return-to-home. No track required."
    )

    # Check if visual-explorer is the active model
    is_explorer_active = active_id == "visual-explorer"

    if not is_explorer_active:
        st.warning(
            "Visual Explorer is not the active model. "
            "Select 'visual-explorer' in the sidebar and set it active to use these controls."
        )

    # -- Status panel --------------------------------------------------------
    st.subheader("Status")

    def get_explorer_status() -> dict | None:
        """Try to fetch explorer status from vehicle runtime."""
        try:
            req = urllib.request.Request(
                f"{VEHICLE_RUNTIME_URL}/explorer/status", method="GET"
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            return None

    explorer_status = get_explorer_status()

    if explorer_status:
        mode = explorer_status.get("mode", "UNKNOWN")
        mode_colors = {
            "EXPLORING": "green",
            "RETURNING": "orange",
            "SAFETY": "red",
            "HOME": "blue",
        }
        color = mode_colors.get(mode, "gray")

        s1, s2, s3, s4 = st.columns(4)
        s1.metric("Mode", mode)
        s2.metric("Distance", f"{explorer_status.get('distance_ft', 0)} ft")
        s3.metric("Breadcrumbs", explorer_status.get("breadcrumbs", 0))
        s4.metric("Landmarks", explorer_status.get("landmarks", 0))

        s5, s6, s7, s8 = st.columns(4)
        pos = explorer_status.get("position", (0, 0))
        s5.metric("Position", f"({pos[0]}, {pos[1]})")
        s6.metric("Heading", f"{explorer_status.get('heading_deg', 0)} deg")
        behavior = explorer_status.get("behavior", "reactive")
        s7.metric("Driving Behavior", behavior)
        if explorer_status.get("stereo_depth"):
            s8.metric("Depth Sensing", "Stereo (2 cam)")
        else:
            s8.metric("Depth Sensing", "Mono (MiDaS)")

        # Inference backend and map coverage
        s9, s10, s11, s12 = st.columns(4)
        s9.metric("Steering", explorer_status.get("steering", 0))
        s10.metric("Throttle", explorer_status.get("throttle", 0))
        map_stats = explorer_status.get("map", {})
        s11.metric("Map Explored", f"{map_stats.get('explored_pct', 0)}%")
        # Show the inference backend from the runtime status if available
        try:
            req = urllib.request.Request(
                f"{VEHICLE_RUNTIME_URL}/explorer/backend", method="GET"
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                backend_info = json.loads(resp.read().decode())
                backend_name = backend_info.get("depth_backend", "unknown")
        except Exception:
            backend_name = "unknown"
        s12.metric("Inference", backend_name)
    else:
        st.info("Explorer not running. Use the controls below to start a mission.")

    st.markdown("---")

    # -- Explorer Variant selector -------------------------------------------
    st.subheader("Explorer Variant")
    st.caption(
        "Choose how the explorer drives. Hybrid variants borrow steering reflexes "
        "from a trained track model while the explorer still handles obstacle avoidance."
    )

    def get_explorer_variants() -> dict:
        try:
            req = urllib.request.Request(
                f"{VEHICLE_RUNTIME_URL}/explorer/variants", method="GET"
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            return {"variants": [], "current": "pure"}

    variants_data = get_explorer_variants()
    all_variants = variants_data.get("variants", [])
    current_variant = variants_data.get("current", "pure")

    if all_variants:
        variant_ids    = [v["id"] for v in all_variants]
        variant_labels = [v["label"] for v in all_variants]
        variant_descs  = {v["id"]: v["description"] for v in all_variants}
        variant_avail  = {v["id"]: v["model_available"] for v in all_variants}
        variant_hybrid = {v["id"]: v["is_hybrid"] for v in all_variants}

        # Label with availability note for hybrid variants
        display_labels = []
        for v in all_variants:
            label = v["label"]
            if v["is_hybrid"] and not v["model_available"]:
                label += " (model not found -- will use pure explorer)"
            display_labels.append(label)

        current_idx = variant_ids.index(current_variant) if current_variant in variant_ids else 0

        selected_label = st.radio(
            "Driving Mode",
            display_labels,
            index=current_idx,
            key="explorer_variant_radio",
        )
        selected_idx = display_labels.index(selected_label)
        selected_id  = variant_ids[selected_idx]

        st.caption(variant_descs.get(selected_id, ""))

        if variant_hybrid.get(selected_id) and variant_avail.get(selected_id):
            st.info(
                "Hybrid mode: track model handles smooth steering. "
                "Explorer takes over when obstacles are detected."
            )
        elif variant_hybrid.get(selected_id) and not variant_avail.get(selected_id):
            st.warning(
                "Track model file not found on disk. "
                "Run `python -m model_registry.preflight --fix` to download it. "
                "The explorer will run in pure mode as a fallback."
            )

        col_apply, col_status = st.columns([2, 3])
        with col_apply:
            if st.button("Apply Variant", key="apply_variant", use_container_width=True):
                try:
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/variant?variant_id={selected_id}",
                        method="POST",
                        data=b"",
                        headers={"Content-Type": "application/json"},
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        result = json.loads(resp.read().decode())
                    if result.get("ok"):
                        backend = result.get("backend", "none")
                        loaded  = result.get("track_model_loaded", False)
                        if loaded:
                            st.success(
                                f"Variant set: {result.get('label')} "
                                f"(backend: {backend})"
                            )
                        else:
                            st.success(f"Variant set: {result.get('label')}")
                        st.rerun()
                    else:
                        st.error(result.get("error", "Failed to set variant"))
                except Exception:
                    st.error("Could not reach runtime to set variant.")

        with col_status:
            if current_variant != "pure":
                st.markdown(f"**Active variant:** `{current_variant}`")
            else:
                st.markdown("**Active variant:** Pure Explorer")
    else:
        st.info("Variant info not available. Explorer runtime may not be running.")

    st.markdown("---")

    # -- Mission presets -----------------------------------------------------
    st.subheader("Quick Missions")
    st.caption("Select a distance and the car will explore outward, then automatically return home.")

    mission_cols = st.columns(5)
    distances = [
        ("10 ft", 10),
        ("20 ft", 20),
        ("50 ft", 50),
        ("100 ft", 100),
        ("Custom", 0),
    ]

    for i, (label, dist) in enumerate(distances):
        with mission_cols[i]:
            if label == "Custom":
                custom_dist = st.number_input(
                    "Custom (ft)", min_value=5, max_value=500, value=30, step=5,
                    key="custom_distance",
                )
            else:
                if st.button(label, key=f"mission_{dist}", use_container_width=True):
                    try:
                        data = json.dumps({"distance_ft": dist}).encode()
                        req = urllib.request.Request(
                            f"{VEHICLE_RUNTIME_URL}/explorer/start",
                            method="POST", data=data,
                            headers={"Content-Type": "application/json"},
                        )
                        urllib.request.urlopen(req, timeout=3)
                        st.success(f"Mission started: explore {dist} ft and return")
                        st.rerun()
                    except Exception:
                        st.error("Failed to start mission. Is the runtime running?")

    # Custom distance start button
    if st.button("Start Custom Mission", use_container_width=True, key="start_custom"):
        custom_val = st.session_state.get("custom_distance", 30)
        try:
            data = json.dumps({"distance_ft": custom_val}).encode()
            req = urllib.request.Request(
                f"{VEHICLE_RUNTIME_URL}/explorer/start",
                method="POST", data=data,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=3)
            st.success(f"Mission started: explore {custom_val} ft and return")
            st.rerun()
        except Exception:
            st.error("Failed to start mission. Is the runtime running?")

    st.markdown("---")

    # -- Time-based missions -------------------------------------------------
    st.subheader("Time-Based Missions")
    st.caption("Explore for a set duration, then automatically return.")

    time_cols = st.columns(4)
    time_presets = [
        ("1 min", 60),
        ("2 min", 120),
        ("5 min", 300),
        ("10 min", 600),
    ]

    for i, (label, secs) in enumerate(time_presets):
        with time_cols[i]:
            if st.button(label, key=f"time_{secs}", use_container_width=True):
                try:
                    data = json.dumps({"time_seconds": secs}).encode()
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/start",
                        method="POST", data=data,
                        headers={"Content-Type": "application/json"},
                    )
                    urllib.request.urlopen(req, timeout=3)
                    st.success(f"Mission started: explore for {label} and return")
                    st.rerun()
                except Exception:
                    st.error("Failed to start mission. Is the runtime running?")

    st.markdown("---")

    # -- Manual controls -----------------------------------------------------
    st.subheader("Manual Controls")

    ctrl_cols = st.columns(4)

    with ctrl_cols[0]:
        if st.button("Free Explore", use_container_width=True, type="primary"):
            try:
                data = json.dumps({"distance_ft": 0, "time_seconds": 300}).encode()
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/start",
                    method="POST", data=data,
                    headers={"Content-Type": "application/json"},
                )
                urllib.request.urlopen(req, timeout=3)
                st.success("Free exploration started (5 min timeout)")
                st.rerun()
            except Exception:
                st.error("Failed to start")

    with ctrl_cols[1]:
        if st.button("Return Home Now", use_container_width=True):
            try:
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/return",
                    method="POST", data=b"",
                )
                urllib.request.urlopen(req, timeout=3)
                st.info("Return-to-home triggered")
                st.rerun()
            except Exception:
                st.error("Failed to trigger return")

    with ctrl_cols[2]:
        if st.button("Pause", use_container_width=True):
            try:
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/pause",
                    method="POST", data=b"",
                )
                urllib.request.urlopen(req, timeout=3)
                st.info("Explorer paused")
                st.rerun()
            except Exception:
                st.error("Failed to pause")

    with ctrl_cols[3]:
        if st.button("STOP", use_container_width=True, type="secondary"):
            try:
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/stop",
                    method="POST", data=b"",
                )
                urllib.request.urlopen(req, timeout=3)
                st.warning("Explorer stopped")
                st.rerun()
            except Exception:
                st.error("Failed to stop")

    st.markdown("---")

    # -- Driving behavior selector -------------------------------------------
    st.subheader("Driving Behavior")
    st.caption(
        "Select how the car drives in free space. The safety layer always "
        "overrides when obstacles are detected -- the behavior only controls "
        "steering and throttle in the clear."
    )

    behaviors = [
        ("reactive", "Reactive", "Proportional steering, fixed throttle. Reliable default."),
        ("smooth-pursuit", "Smooth Pursuit", "Exponentially smoothed steering for fluid curves."),
        ("speed-adaptive", "Speed Adaptive", "Varies throttle based on how open the space is."),
        ("trained-model", "Trained Model", "ONNX model predicts steering from camera frame."),
    ]

    current_behavior = explorer_status.get("behavior", "reactive") if explorer_status else "reactive"
    behavior_ids = [b[0] for b in behaviors]
    current_idx = behavior_ids.index(current_behavior) if current_behavior in behavior_ids else 0

    beh_cols = st.columns(len(behaviors))
    for i, (bid, label, desc) in enumerate(behaviors):
        with beh_cols[i]:
            is_current = bid == current_behavior
            btn_type = "primary" if is_current else "secondary"
            if is_current:
                st.markdown(f"**{label}**")
                st.caption(f"(active) {desc}")
            else:
                if st.button(label, key=f"beh_{bid}", use_container_width=True):
                    try:
                        payload = {"behavior_id": bid}
                        # For trained-model, include model path if set
                        if bid == "trained-model":
                            payload["model_path"] = st.session_state.get(
                                "trained_model_path", ""
                            )
                        data = json.dumps(payload).encode()
                        req = urllib.request.Request(
                            f"{VEHICLE_RUNTIME_URL}/explorer/behavior",
                            method="POST", data=data,
                            headers={"Content-Type": "application/json"},
                        )
                        urllib.request.urlopen(req, timeout=3)
                        st.success(f"Switched to {label}")
                        st.rerun()
                    except Exception:
                        st.error("Failed to switch behavior")
                st.caption(desc)

    # Trained model path input (only shown when trained-model is selected or available)
    with st.expander("Trained Model Settings"):
        st.text_input(
            "ONNX model path",
            value="",
            key="trained_model_path",
            help="Path to an ONNX steering model (e.g. models/my-driver.onnx). "
                 "The model takes a 160x120 RGB image and outputs steering [-1, 1].",
        )
        blend = st.slider(
            "Blend ratio (model vs reactive)",
            min_value=0.0, max_value=1.0, value=0.5, step=0.1,
            key="trained_model_blend",
            help="0.0 = pure reactive, 1.0 = pure trained model. "
                 "Values in between blend both for safety.",
        )

    st.markdown("---")

    # -- Settings ------------------------------------------------------------
    st.subheader("Explorer Settings")

    settings_col1, settings_col2 = st.columns(2)

    with settings_col1:
        st.markdown("**Speed Profile**")
        speed_profile = st.select_slider(
            "Exploration speed",
            options=["Cautious", "Normal", "Fast"],
            value="Normal",
            key="speed_profile",
        )
        speed_map = {"Cautious": 0.25, "Normal": 0.4, "Fast": 0.6}
        st.caption(f"Throttle: {speed_map[speed_profile]}")

        st.markdown("**Obstacle Sensitivity**")
        sensitivity = st.select_slider(
            "How cautious around obstacles",
            options=["Aggressive", "Normal", "Cautious"],
            value="Normal",
            key="obstacle_sensitivity",
        )

    with settings_col2:
        st.markdown("**USB Camera (Stereo Depth)**")
        if explorer_status and explorer_status.get("usb_camera"):
            st.success("USB camera detected -- stereo depth active")
            st.caption(
                "Two forward-facing cameras provide stereo depth: real metric "
                "distances to obstacles instead of MiDaS relative estimates. "
                "Keep the USB camera mounted 8-12 cm beside the built-in camera, "
                "both facing forward, same height."
            )
        else:
            st.info("No USB camera detected -- using mono depth (MiDaS)")
            st.caption(
                "Plug in a USB camera beside the built-in camera (both facing "
                "forward, 8-12 cm apart) to upgrade from monocular depth to "
                "stereo depth. The explorer auto-detects it on start."
            )

        st.markdown("**Breadcrumb Density**")
        density = st.select_slider(
            "How often to drop position markers",
            options=["Sparse", "Normal", "Dense"],
            value="Normal",
            key="breadcrumb_density",
        )
        density_map = {"Sparse": 30, "Normal": 15, "Dense": 5}
        st.caption(f"Every {density_map[density]} frames")

    if st.button("Apply Settings", use_container_width=True):
        try:
            settings = {
                "explore_throttle": speed_map[speed_profile],
                "breadcrumb_interval_frames": density_map[density],
                "obstacle_sensitivity": sensitivity.lower(),
            }
            data = json.dumps(settings).encode()
            req = urllib.request.Request(
                f"{VEHICLE_RUNTIME_URL}/explorer/settings",
                method="POST", data=data,
                headers={"Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=3)
            st.success("Settings applied")
        except Exception:
            st.error("Failed to apply settings. Is the runtime running?")

    st.markdown("---")

    # -- Map and trail visualization ------------------------------------------
    st.subheader("Exploration Map")

    map_stats = explorer_status.get("map") if explorer_status else None

    if map_stats and map_stats.get("explored_pct", 0) > 0:
        map_col1, map_col2 = st.columns([3, 1])

        with map_col2:
            st.metric("Explored", f"{map_stats['explored_pct']}%")
            st.metric("Free Area", f"{map_stats.get('free_area_sq_ft', 0)} sq ft")
            st.metric("Free Cells", map_stats.get("free_cells", 0))
            st.metric("Obstacles", map_stats.get("occupied_cells", 0))
            st.metric("Breadcrumbs", explorer_status.get("breadcrumbs", 0))
            st.metric("Updates", map_stats.get("updates", 0))
            
            # Confidence metrics
            st.markdown("---")
            st.markdown("**Map Confidence**")
            avg_conf = map_stats.get("avg_confidence", 0)
            threshold = map_stats.get("confidence_threshold", 3)
            
            # Color code confidence
            if avg_conf >= threshold:
                conf_color = "normal"
            elif avg_conf >= threshold * 0.7:
                conf_color = "off"
            else:
                conf_color = "inverse"
            
            st.metric("Avg Confidence", f"{avg_conf:.1f}", delta=None, delta_color=conf_color)
            st.metric("High Conf.", map_stats.get("high_confidence_cells", 0))
            st.metric("Low Conf.", map_stats.get("low_confidence_cells", 0))
            if map_stats.get("conflict_cells", 0) > 0:
                st.metric("Conflicts", map_stats.get("conflict_cells", 0), delta="⚠️", delta_color="inverse")

        with map_col1:
            st.caption(
                "Dark gray = unexplored, white = free space, "
                "red = obstacle, blue dot = car. "
                "Yellow = low confidence, Purple = conflicts"
            )
            # Real-time map image with refresh controls
            auto_refresh = st.checkbox("Auto-refresh map (2s)", value=True, key="map_auto_refresh")
            
            # Fetch the rendered map image from the runtime
            try:
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/map-image", method="GET"
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    import io
                    from PIL import Image
                    img_data = resp.read()
                    img = Image.open(io.BytesIO(img_data))
                    st.image(img, caption="Occupancy Map (live)", use_container_width=True)
                    
                    # Show last update time
                    map_time = explorer_status.get("map_time", "")
                    if map_time:
                        st.caption(f"Last updated: {map_time}")
            except Exception:
                st.caption("Map image requires active runtime connection.")

            # Trail overlay as scatter plot
            try:
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/trail", method="GET"
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    trail_data = json.loads(resp.read().decode())
                    if trail_data.get("crumbs"):
                        import pandas as pd
                        df = pd.DataFrame(trail_data["crumbs"])
                        if "x" in df.columns and "y" in df.columns:
                            st.scatter_chart(df, x="x", y="y", size=3)
            except Exception:
                pass

        st.caption(
            "The map persists between runs. On future explorations, "
            "the car will prioritize unexplored areas (frontiers) and "
            "navigate confidently through known free space."
        )
        
        # Map download button
        col1, col2 = st.columns([1, 3])
        with col1:
            if st.button("💾 Save Map", use_container_width=True):
                try:
                    req = urllib.request.Request(
                        f"{VEHICLE_RUNTIME_URL}/explorer/map-save",
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        result = json.loads(resp.read().decode())
                        if result.get("success"):
                            st.success("Map saved to explorer_state/")
                        else:
                            st.error("Save failed")
                except Exception:
                    st.error("Failed to save map")
        
        with col2:
            st.caption("Map saves automatically when exploration stops, but you can also save manually.")
        
        # Re-exploration suggestions
        if st.button("🔄 Find Areas to Re-explore", use_container_width=True):
            try:
                req = urllib.request.Request(
                    f"{VEHICLE_RUNTIME_URL}/explorer/reexplore?max_results=5",
                    method="GET"
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode())
                    if data.get("areas"):
                        st.success("Found areas that need re-exploration:")
                        for i, area in enumerate(data["areas"][:3], 1):
                            st.write(f"{i}. Position ({area['x']:.1f}, {area['y']:.1f}) - confidence: {area['confidence']:.1f}")
                        st.caption("The navigator will prioritize these areas on the next exploration run.")
                    else:
                        st.info("No low-confidence areas found. Map looks good!")
            except Exception:
                st.error("Failed to get re-exploration suggestions")
        
        # Auto-refresh logic
        if auto_refresh and explorer_status and explorer_status.get("mode") == "exploring":
            time.sleep(2)  # Wait 2 seconds before refresh
            st.rerun()
    else:
        st.info(
            "No map data yet. Start an exploration mission to build "
            "a map of the environment. The map saves between runs -- "
            "future explorations will be faster and smarter."
        )
        
        # Still auto-refresh when no map but explorer is running
        if explorer_status and explorer_status.get("mode") == "exploring":
            if st.checkbox("Auto-refresh while exploring", value=True, key="no_map_refresh"):
                time.sleep(2)
                st.rerun()

# ---------------------------------------------------------------------------
# Tab: Switch History
# ---------------------------------------------------------------------------
with tab_history:
    st.header("Model Switch History")

    history = get_switch_history(limit=50)
    if not history:
        st.info("No switches recorded yet.")
    else:
        history_rows = []
        for h in history:
            history_rows.append({
                "Time": h.get("timestamp", ""),
                "From": h.get("previous_model_id") or "(none)",
                "To": h.get("model_id", ""),
                "Operator": h.get("operator", "") or "",
                "Note": h.get("note", "") or "",
            })
        st.dataframe(history_rows, use_container_width=True)

        # Timeline visualization
        st.markdown("---")
        st.subheader("Switch Timeline")
        for h in history[:20]:
            prev = h.get("previous_model_id") or "none"
            to = h.get("model_id", "")
            ts = h.get("timestamp", "")[:19]
            op = h.get("operator", "")
            note = h.get("note", "")
            op_str = f" by {op}" if op else ""
            note_str = f" -- {note}" if note else ""
            st.markdown(f"`{ts}` {prev} -> **{to}**{op_str}{note_str}")

# ---------------------------------------------------------------------------
# Tab: All Models
# ---------------------------------------------------------------------------
with tab_all:
    st.header("All Registered Models")

    show_archived = st.checkbox("Include archived models")
    all_models = list_models(include_archived=show_archived)

    if not all_models:
        st.info("No models registered.")
    else:
        rows = []
        for m in all_models:
            is_active = m.id == active_id
            rows.append({
                "Active": ">>>" if is_active else "",
                "ID": m.id,
                "Name": m.display_name,
                "Source": m.source_type,
                "Format": m.format,
                "Status": m.status,
                "Version": m.version,
                "Action Space": format_action_space(m),
                "Date Added": m.date_added[:10] if m.date_added else "",
            })

        st.dataframe(rows, use_container_width=True)

        # Quick add model form
        st.markdown("---")
        st.subheader("Quick Log Evaluation Run")
        with st.form("log_eval_form"):
            eval_model = st.selectbox(
                "Model",
                options=[m.id for m in all_models],
                format_func=lambda x: model_options.get(x, x),
            )
            form_cols = st.columns(4)
            eval_track = form_cols[0].text_input("Track", value="lab")
            eval_laps = form_cols[1].number_input("Laps", min_value=0, value=1)
            eval_off_track = form_cols[2].number_input("Off-Track", min_value=0, value=0)
            eval_crashes = form_cols[3].number_input("Crashes", min_value=0, value=0)

            form_cols2 = st.columns(3)
            eval_speed = form_cols2[0].number_input("Avg Speed (m/s)", min_value=0.0, value=0.0, step=0.1)
            eval_status = form_cols2[1].selectbox("Completion", ["full", "partial", "dnf"])
            eval_operator = form_cols2[2].text_input("Operator")

            eval_notes = st.text_input("Notes")

            if st.form_submit_button("Log Evaluation Run", type="primary"):
                from model_registry.eval_logger import log_eval
                entry = log_eval(
                    model_id=eval_model,
                    track=eval_track,
                    lap_count=int(eval_laps),
                    completion_status=eval_status,
                    off_track_count=int(eval_off_track),
                    crash_count=int(eval_crashes),
                    avg_speed=float(eval_speed) if eval_speed > 0 else None,
                    operator=eval_operator,
                    notes=eval_notes,
                )
                st.success(f"Logged eval {entry['eval_id']} for {eval_model}")
                st.rerun()
