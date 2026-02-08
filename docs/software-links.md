Save as: docs/software-links.md



Software Links

Simulator, Training Environment, and Racer Software

This document lists the upstream open-source projects we rely on or fork for the autonomous racer project.

These repositories are starting points, not final products.Students and instructors will fork, adapt, and extend them.



1. Simulation & Training Environment

AWS DeepRacer for Cloud (DRfC)

Purpose:Local and cloud-based DeepRacer simulation + training without AWS console lock-in.

Repo:https://github.com/aws-deepracer-community/deepracer-for-cloud

Used for:

local simulator bring-up

track rendering

baseline training pipeline

containerized sim runtime

Notes:

We layer a manual driving UI on top

We add learning-from-demonstration logging

We add press-play autonomous evaluation



DeepRacer Simulator Application (SimApp)

Purpose:Core DeepRacer simulation logic and environment internals.

Repo:https://github.com/aws-deepracer-community/deepracer-simapp

Used for:

track definitions

simulator physics & camera pipeline

hooks for run evaluation (off-track, collisions)

Notes:

Mostly referenced or lightly forked

Used when we need deeper simulator hooks



2. Training & Model Code

AWS DeepRacer Training Stack (Reference)

Purpose:Baseline RL and training patterns used by DeepRacer.

Repo (umbrella):https://github.com/aws-deepracer

Relevant components:

training workflows

reward function patterns

model packaging conventions

Notes:

We do not rely on AWS-managed training

We adapt ideas, not infrastructure

Our primary approach is Learning from Demonstration (LfD)



3. Physical Racer / Vehicle Runtime

AWS DeepRacer Vehicle Software

Purpose:On-vehicle software stack (ROS-based) for running models on the physical racer.

Repo(s):https://github.com/aws-deepracer/aws-deepracer-device-softwarehttps://github.com/aws-deepracer/aws-deepracer-samples

Used for:

camera ingestion

inference pipeline

motor control

telemetry

Notes:

Forked for:

battery awareness

safe stop / return-to-base

custom model loading (ONNX / OpenVINO)

Physical deployment happens later in the semester



4. Model Formats & Inference

OpenVINO

Purpose:Efficient inference on edge devices.

Repo / Docs:https://github.com/openvinotoolkit/openvino

Used for:

model optimization

deployment to physical racer

optional simulator inference acceleration



ONNX

Purpose:Portable model interchange format.

Site:https://onnx.ai/

Used for:

exporting trained models

consistent simulator ↔ racer deployment



5. How We Use These Repos

We do not treat these as black boxes.

Our approach:

fork upstream repos as needed

keep our own canonical APIs and data contracts

layer:

manual driving UI

LfD data capture

autonomous evaluation

dashboards

treat upstream as infrastructure, not curriculum

Students interact primarily with our code, not raw upstream repos.



6. Where This Fits

This doc supports:

the PRD

the deployment & hardware spec

the student onboarding guide

AI-assisted code generation

instructor setup

If a repo is not listed here, it is not required for the project.



