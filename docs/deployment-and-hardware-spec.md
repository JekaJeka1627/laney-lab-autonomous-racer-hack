Deployment & Hardware Specification

Autonomous Driving System — Physical Vehicle Target



1. Purpose

This document defines the physical deployment target for the autonomous driving system described in the PRD, including:

vehicle capabilities,

onboard hardware requirements,

software stack on the vehicle,

simulator-to-hardware parity constraints,

deployment, testing, and validation expectations.

This specification ensures that models trained and validated in simulation can be safely and reliably deployed to a real vehicle operating in lab or campus environments.



2. Deployment Target Overview

The deployment target is a small autonomous ground vehicle capable of operating in:

indoor lab environments, and

controlled outdoor environments (e.g., quad, courtyard).

The vehicle must operate fully autonomously, using onboard perception and compute, with no external control during normal operation.



3. Required Vehicle Capabilities

The deployed vehicle must support the following behaviors:

3.1 Autonomous Navigation

Lane-following or path-following using vision-based perception

Continuous steering and throttle control via onboard inference

Stable operation at low to moderate speeds suitable for pedestrian environments



3.2 Obstacle Awareness & Avoidance

Detect obstacles in the vehicle’s path

Reduce speed or stop when obstacles are detected

Execute avoidance or recovery behaviors where possible

Obstacle handling may be implemented using:

learned behavior,

deterministic safety layers,

or a hybrid of both.



3.3 Battery Monitoring & Energy Awareness

Continuous monitoring of battery voltage or state-of-charge

Ability to classify battery state (normal / low / critical)

Exposure of battery state to the autonomy stack



3.4 Autonomous Return-to-Base

When battery state is low, the vehicle must:

disengage normal navigation,

navigate toward a predefined base or docking zone,

stop safely upon arrival.

Docking precision and automated charging are optional extensions, not required for baseline deployment.



3.5 Safety & Fail-Safe Behavior

Emergency stop capability (hardware and/or software)

Safe stop on:

sensor failure,

inference failure,

control timeout,

critical battery state

Deterministic override must always supersede learned behavior



4. Onboard Hardware Requirements

4.1 Compute

CPU capable of real-time inference (x86 or ARM)

Linux-based operating system

Sufficient performance for:

camera ingestion,

model inference,

control loop execution,

telemetry logging

Optional:

Edge acceleration (e.g., OpenVINO-supported hardware)



4.2 Sensors

Required

Forward-facing RGB camera

Fixed mounting position

Known resolution and field of view

Exposure and white balance controllable or stabilized

Recommended (Non-Blocking)

IMU (orientation, acceleration)

Wheel encoders

Proximity or range sensors (ultrasonic / IR / LiDAR)



4.3 Actuation

Steering control (continuous or discretized)

Throttle or speed control

Hardware interface accessible via software (e.g., ROS topics, device drivers)



4.4 Power System

Rechargeable battery

Battery voltage or state telemetry accessible to software

Power budget sufficient for continuous autonomous operation sessions



5. Vehicle Software Stack

5.1 Operating Environment

Linux OS

Containerized or service-based architecture preferred

SSH or equivalent remote access for development and monitoring



5.2 Autonomy Runtime Components

The vehicle must run the following logical components:

Sensor Ingestion

Camera capture

Optional auxiliary sensors

Model Inference

Load trained model artifact

Execute image → steering inference

Real-time constraints enforced

Control Layer

Translate model outputs into actuator commands

Enforce speed and steering bounds

Safety Layer

Override or halt on unsafe conditions

Battery and fault monitoring

Telemetry & Logging

Record key events and metrics

Support post-run analysis



6. Simulator-to-Hardware Parity Requirements

To ensure seamless deployment, the simulator and physical vehicle must maintain parity across the following interfaces:

6.1 Sensor Interface

Camera image format

Resolution and color space

Preprocessing steps



6.2 Model Interface

Identical model input/output schema

No architecture changes between simulation and deployment

Hardware-specific optimization permitted (e.g., inference backend)



6.3 Control Interface

Same control semantics:

steering range

throttle semantics

Scaling differences must be handled via configuration, not code forks



6.4 State Reporting

Battery state

Fault conditions

Execution status

These states must be representable in both simulation and hardware contexts.



7. Deployment Workflow

The system must support the following deployment workflow:

Model Selection

Choose a versioned model from the model registry

Model Packaging

Convert or optimize for vehicle runtime if required

Vehicle Deployment

Transfer model to vehicle

Activate model in inference service

Controlled Test Runs

Run in constrained environment

Observe behavior and safety conditions

Iterative Validation

Compare physical performance to simulator metrics

Identify sim-to-real gaps



8. Testing & Validation Requirements

8.1 Functional Testing

Vehicle can:

start autonomously

navigate without intervention

stop safely

return to base on low battery



8.2 Safety Testing

Emergency stop tested regularly

Sensor disconnect and fault scenarios validated

Battery low and critical states tested



8.3 Sim-to-Real Consistency

Behavioral differences between simulation and hardware are documented

Adjustments are made via:

data collection,

configuration,

environment modeling (not model architecture changes)



9. Extensibility

The deployment architecture must allow for:

additional sensors

alternative vehicle platforms

improved docking and charging

multi-vehicle operation

These extensions must not require redesign of the core simulator or training pipeline.



10. Success Criteria

The deployment target is considered successful when:

a model trained in simulation can be deployed to the vehicle,

the vehicle operates autonomously in real environments,

safety systems reliably override learned behavior when needed,

battery-aware return-to-base behavior functions correctly,

system behavior can be analyzed and iterated upon.



