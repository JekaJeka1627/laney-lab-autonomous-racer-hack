Learning Outcomes & Student Takeaways

Deep Learning 1 – Autonomous Driving Project



1. What This Project Is (At a High Level)

In this course project, students work together to build, train, and evaluate an autonomous driving system.

Rather than starting with a fixed dataset, the class creates the dataset themselves by driving a virtual racer in a simulation environment. Every drive contributes new data. That data is used to train a shared model, which students can then run autonomously and evaluate.

Over time, the class watches the system improve as more human demonstrations are added.

This mirrors how real-world ML systems are built and improved.



2. How the Class Works Together

Phase 1: Build Together

At the start, the class works as one team to:

understand the system at a high level,

stand up the simulator and training loop,

define how data is collected, stored, and evaluated,

establish shared tooling and workflows.

This ensures every student understands the full ML lifecycle, even if only at a high level.



Phase 2: Specialize into Teams

As the system stabilizes, students split into specialized teams, such as:

Simulator & UI

Backend & Data

ML & Training

Metrics & Dashboards

Deployment & Edge Inference (later)

Each team owns a real subsystem, just like in industry.



Phase 3: Re-converge

At the end of the project:

teams come back together,

integrate their work,

evaluate the final model,

and demonstrate how the system improved over time.

Students see how individual contributions combine into a working ML product.



3. What Students Actually Do (Concrete Experience)

Learning From Demonstration (LfD)

Instead of pre-labeled datasets:

Students drive the virtual racer manually

The system records:

camera frames

steering commands

These demonstrations become training data

The more the class drives:

the dataset grows

the model improves

autonomous runs become smoother and more reliable

Students directly experience the relationship between:

human behavior → data quality → model performance



Train, Run, Observe, Repeat

Students repeatedly:

Train a model on accumulated data

Run the model autonomously in the simulator

Observe failures and successes

Add more demonstrations to improve it

This reinforces the idea that models improve through iteration, not one-time training.



4. Core Deep Learning Concepts Students Learn

By participating, students gain hands-on experience with:

supervised learning from real data

neural networks for perception and control

dataset construction and curation

train / evaluate / iterate workflows

overfitting, generalization, and data bias

performance metrics and evaluation

the limits of models trained on imperfect data

These concepts are learned by doing, not just by lecture.



5. Software Engineering & Systems Skills

Students also learn how ML systems work in practice:

working in a shared codebase

API-driven system design

data pipelines and versioning

model registries and artifacts

dashboards for model performance

simulation vs real-world constraints

edge inference considerations (OpenVINO, ONNX)

This bridges deep learning theory with real deployment realities.



6. Tools & Workflows Students Use

Students gain experience with tools and workflows commonly used in industry:

Python for ML and backend systems

Git and pull requests for collaboration

containerized development environments

task-driven development using a project management platform

AI-assisted debugging and learning support

exposure to OpenVINO for edge inference

These are transferable, marketable skills.



7. Marketable Skills Students Can Claim

By the end of the project, students can truthfully say they have experience with:

building and training deep learning models

collecting and managing real-world ML datasets

learning-from-demonstration systems

simulation-based model evaluation

collaborative ML system development

deploying optimized inference models to edge devices

working on a long-running, team-built software project

These are skills employers recognize and value.



8. What Makes This Project Different

Unlike typical class projects:

there is no fixed dataset

there is no single “correct” answer

progress is visible and cumulative

every student contributes to a shared outcome

Students see the model improve because of their collective effort, which creates both technical understanding and motivation.



9. The Takeaway

Students leave this project with:

a practical understanding of deep learning systems

experience working on a real ML product

confidence navigating complex codebases

evidence of teamwork and ownership

a clear story they can tell in interviews

Most importantly, we will understand how deep learning works in the real world.



