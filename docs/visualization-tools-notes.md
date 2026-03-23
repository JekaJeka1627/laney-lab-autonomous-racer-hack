# Visualization Tools Notes

This document captures the visualization views that would be most useful for managing the DeepRacer project and understanding the remaining path to completion.

The goal is not just "pretty charts." The goal is to make planning, sequencing, and bottlenecks obvious at a glance.

## Most Useful Visualization Types

### 1. Task Dependency DAG

Best for:
- seeing the real start-to-finish path
- spotting blockers
- identifying critical path work
- separating PM-owned integration work from classmate-safe tasks

Each node should ideally show:
- task title
- status
- owner or team
- priority
- estimated difficulty
- blocked/unblocked state
- whether the task is on the critical path

Recommended color coding:
- gray: not started
- blue: ready to start
- yellow: in progress
- green: completed
- red: blocked
- purple: PM-only or private critical-path work

Recommended visual grouping:
- simulator
- shared API / data capture
- dataset / training
- evaluation / metrics
- model registry / artifacts
- vehicle runtime
- demo / evidence

### 2. Milestone Roadmap

Best for:
- showing progression by phase
- communicating direction without exposing all low-level details
- keeping classmates focused on the next visible slice

Useful milestone buckets:
- M1: simulator stability
- M2: shared data capture verified
- M3: training job and model artifact verified
- M4: active model inference verified
- M5: demo pipeline rehearsed
- M6: physical runtime readiness
- M7: final evidence package complete

Each milestone should show:
- status
- target outcome
- blocking dependencies
- evidence required to mark it done

### 3. Swimlane Kanban

Best for:
- day-to-day execution
- seeing who owns what
- protecting the team from the full backlog

Recommended swimlanes:
- PM / integration
- Simulator / frontend
- Data / runs
- Training / ML
- Docs / evidence
- Hardware / runtime

Recommended card metadata:
- owner
- team
- due date
- dependency count
- acceptance criteria

### 4. Critical Path View

Best for:
- answering "what actually determines whether we finish"
- preventing low-value work from crowding out the real blockers

This should contain only tasks that can delay successful completion:
- shared run ingestion
- dataset snapshot
- training job success
- ONNX artifact availability
- active model inference
- demo rehearsal
- evidence package

### 5. Evidence Map

Best for:
- tracking whether each claimed feature has proof
- preparing final grading/demo materials

Each row should map:
- requirement or milestone
- proof artifact
- repo path / URL
- owner
- current status

### 6. Risk / Blocker Board

Best for:
- making uncertainty visible
- handling slow teammates without losing schedule control

Each risk should show:
- description
- impact
- likelihood
- owner
- mitigation
- fallback plan

## What A Good DeepRacer DAG Should Include

At minimum, the DAG should cover:

1. Simulator usable
2. Run capture works
3. Run sync to shared API works
4. Shared run summary visible
5. Training job queues
6. Trainer downloads dataset
7. Model trains successfully
8. ONNX artifact uploads
9. Active model can be selected
10. Simulator loads active ONNX model
11. Autonomous mode runs with learned inference
12. Metrics/evaluation recorded
13. Demo flow rehearsed
14. Vehicle runtime path validated
15. Final evidence package assembled

That is the real completion spine.

## Recommended Metadata For Every Task Node

If we build or adopt a visualization tool, each task should ideally carry:

- `id`
- `title`
- `description`
- `status`
- `owner`
- `team`
- `priority`
- `difficulty`
- `phase`
- `depends_on`
- `blocks`
- `critical_path`
- `public_visible`
- `evidence_link`
- `repo_area`

The most important fields are:
- status
- owner/team
- dependencies
- critical path flag
- evidence link

## Good Views For This Project

If we only keep a few, the most useful set is:

1. dependency DAG
2. milestone roadmap
3. Kanban swimlane
4. evidence map

That combination gives:
- sequencing
- progress visibility
- team execution
- proof of completion

## Notes On Team Use

Because the team is inexperienced and slow, the public visualization should stay simplified.

Recommended approach:
- keep the full DAG private for PM use
- keep the public board focused on small tasks
- keep critical-path dependencies visible only to PM/integration view

This avoids overwhelming the team while still giving PM accurate control.

## Candidate Repos / Tools To Keep Handy

Add links and short notes here as they are found.

Template:

- Name:
- URL:
- Type: DAG / roadmap / Gantt / graph / whiteboard / issue visualization
- Why it might help:
- Fit for this project:
- Keep / maybe / reject:

## Initial Evaluation Criteria For Visualization Tools

If we adopt a tool or repo, judge it on:

- Can it show dependency edges clearly?
- Can it color by status?
- Can it group by team or phase?
- Can it handle a moderate number of tasks without becoming unreadable?
- Can it export images or static views for docs/demo?
- Can it be updated quickly without heavy manual work?
- Can we derive the graph from task metadata instead of drawing it by hand every time?

## Recommendation

For this project, the best planning artifact is probably:

- a private dependency DAG for PM control
- a public simplified roadmap or Kanban for classmates

If we later automate this, we should generate the DAG from structured task metadata rather than maintaining it manually.

## ProjectMap Product Direction

Longer-term, this should not be DeepRacer-specific.

The product direction for ProjectMap should be:

- PM uploads files and source docs
- PM adds team members
- PM chooses a visualization from a menu
- ProjectMap generates the appropriate visual from structured project/task metadata

Recommended visualization menu:

- Roadmap
- Dependency DAG
- Tree graph
- Mind map
- Swimlane Kanban
- Evidence map
- Risk map

Recommended workflow:

1. ingest files and extract tasks, milestones, entities, and dependencies
2. let the PM confirm or edit the structure
3. generate one or more views from the same underlying data model
4. allow filtering by team, phase, status, owner, and critical path

This matters because the same project should support multiple visual modes without duplicating project data.

## Top 10 Roadmap Repos

These are a mix of:
- direct roadmap products
- repos with strong roadmap visualization patterns
- repos worth studying as examples for ProjectMap

### 1. `kamranahmedse/developer-roadmap`
- URL: https://github.com/kamranahmedse/developer-roadmap
- Why it matters: best-in-class interactive roadmap presentation
- Best use for ProjectMap: roadmap UX inspiration

### 2. `github/roadmap`
- URL: https://github.com/github/roadmap
- Why it matters: excellent public roadmap operating pattern using issues, labels, and stages
- Best use for ProjectMap: roadmap process and metadata model

### 3. `liuchong/awesome-roadmaps`
- URL: https://github.com/liuchong/awesome-roadmaps
- Why it matters: broad discovery source for roadmap patterns
- Best use for ProjectMap: reference library, not direct UI inspiration

### 4. `Wisemapping/wisemapping-open-source`
- URL: https://github.com/wisemapping/wisemapping-open-source
- Why it matters: good example of turning structured content into visual planning artifacts
- Best use for ProjectMap: visual authoring and collaboration ideas

### 5. `markmap/markmap`
- URL: https://github.com/markmap/markmap
- Why it matters: turns Markdown into a useful expandable visual structure
- Best use for ProjectMap: roadmap or outline-to-visual generation

### 6. `mermaid-js/mermaid`
- URL: https://github.com/mermaid-js/mermaid
- Why it matters: broad, embeddable diagram syntax with roadmap-adjacent support
- Best use for ProjectMap: fast built-in diagrams from text or extracted structure

### 7. `jgraph/drawio`
- URL: https://github.com/jgraph/drawio
- Why it matters: strong general-purpose diagramming reference
- Best use for ProjectMap: export/interoperability ideas rather than native embedding

### 8. `taskjuggler/TaskJuggler`
- URL: https://github.com/taskjuggler/TaskJuggler
- Why it matters: serious project planning/scheduling concepts
- Best use for ProjectMap: milestone and dependency modeling inspiration

### 9. `getgantt/gantt`
- URL: https://github.com/getgantt/gantt
- Why it matters: open project planning / timeline reference
- Best use for ProjectMap: timeline and roadmap interaction ideas

### 10. `antvis/G6`
- URL: https://github.com/antvis/G6
- Why it matters: not a roadmap product, but very strong for building roadmap graphs and dependency visuals
- Best use for ProjectMap: implementation candidate for custom roadmap/DAG rendering

## Top 10 Tree Graph Repos

These are more implementation-oriented and are stronger candidates for ProjectMap features.

### 1. `antvis/G6`
- URL: https://github.com/antvis/G6
- Why it matters: powerful graph engine with hierarchical/tree layouts
- Fit: very strong candidate

### 2. `cytoscape/cytoscape.js`
- URL: https://github.com/cytoscape/cytoscape.js
- Why it matters: mature graph library with rich interaction and layout ecosystem
- Fit: very strong candidate for dependency graphs

### 3. `visjs/vis-network`
- URL: https://github.com/visjs/vis-network
- Why it matters: interactive graph and hierarchical network visualization
- Fit: strong candidate

### 4. `brimdata/react-arborist`
- URL: https://github.com/brimdata/react-arborist
- Why it matters: excellent React tree view for large datasets
- Fit: strong candidate for editable task trees

### 5. `jpb12/react-tree-graph`
- URL: https://github.com/jpb12/react-tree-graph
- Why it matters: lightweight React tree graph rendering
- Fit: good simple-tree option

### 6. `PierreCapo/treeviz`
- URL: https://github.com/PierreCapo/treeviz
- Why it matters: purpose-built JS tree diagrams
- Fit: good specialized option

### 7. `frontend-collective/react-sortable-tree`
- URL: https://github.com/frontend-collective/react-sortable-tree
- Why it matters: editable drag-and-drop hierarchical data
- Fit: strong for authoring, weaker for polished dependency visualization

### 8. `vakata/jstree`
- URL: https://github.com/vakata/jstree
- Why it matters: classic, proven tree UI
- Fit: useful reference, less ideal for modern React-first stack

### 9. `treant-js/treant-js`
- URL: https://github.com/treant-js/treant-js
- Why it matters: classic standalone tree/org-chart rendering
- Fit: decent for static hierarchy views

### 10. `d3/d3-hierarchy`
- URL: https://github.com/d3/d3-hierarchy
- Why it matters: foundational tree/cluster layout engine
- Fit: best if we want full custom rendering control

## Top 10 Mind Map Repos

These are the strongest starting points for mind-map style visual generation.

### 1. `markmap/markmap`
- URL: https://github.com/markmap/markmap
- Why it matters: easiest path from text or Markdown to interactive mind map
- Fit: excellent first integration candidate

### 2. `wisemapping/wisemapping-open-source`
- URL: https://github.com/wisemapping/wisemapping-open-source
- Why it matters: mature collaborative web mind-mapping product
- Fit: excellent reference for full-featured mode

### 3. `awehook/react-mindmap`
- URL: https://github.com/awehook/react-mindmap
- Why it matters: React-based mind map app with richer interaction patterns
- Fit: strong inspiration repo

### 4. `mind-elixir/mind-elixir-core`
- URL: https://github.com/ssshooter/mind-elixir-core
- Why it matters: web mind-map core focused on embedding
- Fit: strong candidate for ProjectMap integration

### 5. `james-tindal/obsidian-mindmap-nextgen`
- URL: https://github.com/james-tindal/obsidian-mindmap-nextgen
- Why it matters: practical Markdown-to-mind-map workflow
- Fit: good inspiration for file-upload -> mindmap flow

### 6. `linus-sch/Mind-Map-Wizard`
- URL: https://github.com/linus-sch/Mind-Map-Wizard
- Why it matters: modern AI-assisted mind-map generation
- Fit: good inspiration for AI-generated project visuals

### 7. `umaranis/MindMate`
- URL: https://github.com/umaranis/MindMate
- Why it matters: desktop mind-mapping/task-management blend
- Fit: useful reference, lower direct integration value

### 8. `pzhaonet/mindr`
- URL: https://github.com/pzhaonet/mindr
- Why it matters: document-to-mind-map conversion ideas
- Fit: useful for document ingestion thinking

### 9. `Kripu77/prompt-map`
- URL: https://github.com/Kripu77/prompt-map
- Why it matters: open-source AI-powered mind-mapping product
- Fit: strong product reference

### 10. `Freeplane/Freeplane`
- URL: https://github.com/Freeplane/Freeplane
- Why it matters: mature desktop mind-map ecosystem
- Fit: valuable reference for features and export formats

## Suggested Shortlist For ProjectMap

If we want the shortest list of repos worth serious evaluation, start with:

### Roadmap / planning inspiration
- `kamranahmedse/developer-roadmap`
- `github/roadmap`
- `mermaid-js/mermaid`

### Graph / DAG implementation
- `antvis/G6`
- `cytoscape/cytoscape.js`
- `visjs/vis-network`

### Mind map implementation
- `markmap/markmap`
- `mind-elixir/mind-elixir-core`
- `wisemapping/wisemapping-open-source`

## My Recommendation For ProjectMap

If the product is going to support "choose from a menu" visuals, the strongest phased approach is:

### Phase 1
- Mermaid roadmap / flowchart export
- Markmap mind maps from uploaded Markdown/docs
- React tree view for hierarchical task breakdown

### Phase 2
- Cytoscape.js or G6 dependency DAG view
- filtered swimlane roadmap view
- evidence map tied to task metadata

### Phase 3
- editable mind-map mode
- auto-generated dependency graph from extracted tasks
- multi-view synchronization across roadmap, DAG, tree, and Kanban

That gives fast value first, then better graph sophistication once the metadata model is stable.
