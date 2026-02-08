Product Requirements Document (PRD)

Virtual Learning-by-Demonstration Autonomous Driving System



1. Product Overview

This product is an autonomous driving system that is trained and validated in a virtual simulator and deployable to a physical vehicle.

Users interact with a game-like simulator to:

manually drive a vehicle and generate demonstrations,

train a shared driving model from human input,

run the model autonomously at any time,

observe and measure model behavior and improvement over time.

The simulator is the primary execution and training environment. The physical vehicle is a supported deployment target.



2. Core Product Loop

The system must make the following loop explicit and repeatable:

Manual driving → data capture → model training → autonomous execution → measurable improvement

All system components exist to support this loop.



3. Simulator Requirements

3.1 Environment

Virtual driving simulator with:

forward-facing RGB camera view

vehicle dynamics suitable for indoor and outdoor paths

Support for multiple tracks / environments

Runtime track selection

Deterministic reset and replay capability



3.2 Manual Drive Mode

The simulator must support human-controlled driving:

Real-time steering input (keyboard or controller)

Optional throttle control

Start / stop / reset controls

Live camera feed during driving

Each manual driving session must generate training data.



3.3 Autonomous Run Mode

The simulator must support fully autonomous execution at any time:

User can select “Run Model” with no human input

The currently active model drives the vehicle

Autonomous runs must be runnable even when the model is untrained or poor

Autonomous runs must be repeatable and logged

Manual and autonomous modes must be equally accessible.



4. Shared Model System

4.1 Model Definition

Single shared model lineage

Model maps:

input: camera images

output: continuous steering value

Models are versioned and retained

Previous model versions remain runnable for comparison



4.2 Training Pipeline

Training uses supervised learning

Training data is sourced from:

manual driving runs

Training is iterative:

new runs → retraining → new model version

Training process must be automated and reproducible



5. Data Model

5.1 Core Artifact: Run

Each simulator session produces a Run.

Run Metadata

run_id

user_id

track_id

mode (manual | autonomous)

model_version (for autonomous runs)

timestamp

duration

frame_count

Run Data

RGB image frames

steering values

timestamps

Runs are immutable once recorded.



5.2 Dataset Construction

Training datasets are assembled from Runs

Dataset composition is traceable to source Runs

Model versions are traceable to dataset snapshots



6. Evaluation & Metrics

Each autonomous run must generate evaluation data.

Minimum required metrics:

track completion

off-track events

steering stability

run duration

Metrics must be associated with:

model version

track

time



7. Dashboard Requirements

Dashboards are a core system component.

7.1 Required Views

Model Timeline

model versions

associated dataset size

Performance Over Time

metrics per model version

per-track breakdown

Run Inspection

replay or summarized run views

Data Growth

run counts

total frames

manual vs autonomous runs

Dashboards must update automatically as new data and models are added.



8. User Interaction Requirements

Any user may:

manually drive the simulator

run the model autonomously

view dashboards

No role-based restrictions for core functionality

The active model version must be clearly visible in the UI



9. Physical Deployment Target

The system must support deployment to a physical autonomous vehicle.

The deployed vehicle must be capable of:

autonomous navigation in lab or quad environments

obstacle detection and avoidance

battery state monitoring

autonomous return-to-base when battery is low

safe stopping and recovery behavior

Simulation and training exist to support this deployment target.



10. Simulator-to-Hardware Parity

The simulator and physical vehicle must share compatible interfaces for:

sensor inputs (camera frames)

model inference (image → steering)

control outputs (steering, throttle)

system state reporting (battery, faults)

Models trained in simulation must be deployable to hardware without architectural changes.



11. System Architecture (High Level)

Simulator runtime

Run logging and storage

Training pipeline

Model registry

Evaluation and metrics computation

Dashboard and visualization layer

Vehicle deployment interface

Components must be modular and independently extensible.



12. Extensibility Requirements

The system must support future extensions without redesign:

additional tracks and environments

additional sensors

alternative model architectures

improved obstacle handling

enhanced docking and charging behavior

multiple vehicle targets



13. Success Criteria

The system is successful when:

users can manually drive the simulator

users can run the model autonomously at any time

human demonstrations measurably improve model behavior

dashboards clearly show improvement over time

trained models can be deployed to a physical vehicle





