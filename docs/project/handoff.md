# Handoff

Snapshot on 2026-11-01. Merged work and accepted branches are distinguished below; branch acceptance is not a main-branch or CI claim. Current actionable work is in [tasks.md](./tasks.md), with detailed [phase 1a](./phases/1a.md) and [phase 1b](./phases/1b.md) plans.

## Merged on main

Main at `25cce95` includes the recovery of `feat/phase-1-models-and-props` (PR #2) and subsequent work:

- Deterministic math, ECS, commands, kernel, entities and flat-world movement; pure footprint placement checks. The placement checker is not yet connected to map-aware spawning, build radius or clearance.
- Terrain layers/validation, camera and chunk geometry for cliffs, ramps, water and biome colouring; initial sandbox maps and original props/resource artwork. Authored map loading/picker is merged in PR #49 (`b7b4520`), with [green CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341685124), including Chromium's real six-map loader tests and Firefox/WebKit goldens. Full worker/debug controls and projected map entities remain future work.
- Eastern Collective first-pass model follow-ups through PR #39 and the Quantum Nexus artwork (PR #9); Alliance of Free Nations Advanced Armory, Cyber Operations Center and Drone Assembly Plant in PR #50–52. Remaining Alliance of Free Nations and Phoenix Initiative completion work is tracked below. No asset-warning count is used as a completion claim.
- Single-model browser inspection with team colours, animation playback and restored rest poses (PR #40). This is not map entity rendering or a sim client.
- Headless scenario runner (PR #41), browser-safe sim testing fixtures (PR #42), targeted map generation/previews (PR #43), `sandbox-biomes` (PR #44) and Training Grounds height/ramp terrain (PR #45).
- Two-Force 10,000-tick checkpoint goldens (PR #46, `6519ae8`). [CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) passed Bun verification and the scenario/numeric digests in Chromium, Firefox and WebKit. Phase 1a's exit is met; the earlier local Firefox profile error is not an outstanding CI gate.
- Headless tick/ECS benchmark (PR #47, `f710103`), with a [first measurement](./learnings/2026-11-01-first-tick-benchmark.md) covering flat-world movement only, not pathfinding or browser frame rate; first-divergent-tick traces and comparison (PR #48, `d0fd2ca`).
- Pure incremental A* over an explicit integer grid (PR #53, `3eb0b39`), without terrain compilation, Force budgets or movement integration. Flat-world worker/projection foundation (PR #54, `25cce95`), with per-seat handles, grant-restricted views and explicit debug-only no-fog; map setup and renderer binding remain follow-ups.

## Accepted implementation awaiting merge

- Remaining Alliance of Free Nations models: `art/alliance-model-completion`, `bdd1f19`; Phoenix Initiative models: `art/phoenix-model-completion`, `940eb2a`. Both source branches were independently reviewed. Publish remaining existing definition folders as individual art PRs, retaining source, required clips/remains, icons and provenance. They remain ongoing until merged and validated together.
- Strict model presentation validation through `50230d8` is held until both art completion branches are integrated. Do not enable it against incomplete art or weaken it to get a green run.

## Continue phase 1b

The [plan](./phases/1b.md) breaks the former broad queue into map-aware setup/occupancy, navigation compiler, reachability, per-Force budgets, path following/invalidation, map projection and worker integration, renderer instances/animations, individual debug tools, selection/orders, e2e and measured performance tasks. The flat-world portions of 1B-25/26 are merged; map integration and rendering the worker's copied snapshots remain follow-ups. Baseline placeholders alone are not completed implementations.

The [owner's water-domain table](./decisions/2026-11-01-movement-water-table.md) is accepted. The standalone 1B-19 compiler is implemented on branch, with independent review and PR delivery pending; it is not registered with movement or match state. The existing water map's geometry is complete. Node-bound structure policy and concrete build-radius/clearance rules remain owner decisions. Final faction roster, balance and art-direction sign-offs remain pending as well; first-pass art work does not decide them.

Finish accepted delivery, then pick dependency-ready work from [tasks.md](./tasks.md), one focused PR at a time. Do not claim phase 1b from model previews or headless timings: its unchanged [exit](./roadmap.md#exit-criteria) requires the real projection-only debug client, all sandbox maps, placement, selection/orders, CI e2e and a measured 200-unit terrain workload at 60 fps on medium.

Pending owner decisions: [human-tasks.md](./human-tasks.md). Working rules: [AGENTS.md](../../AGENTS.md).
