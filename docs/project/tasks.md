# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. One task, one pull request of the type shown ([pull-requests.md](../contributing/pull-requests.md)). Dependencies, scope and acceptance criteria live in the [phase plans](./phases/README.md); work blocked on a person goes in [human-tasks.md](./human-tasks.md).

## Phase 1a: delivery status

The [phase-1a exit](./phases/1a.md#exit-criteria) is met: PR #46 passed Bun and Chromium, Firefox and WebKit [in CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) and merged at `6519ae8`. The [benchmark](./phases/1a.md#1a-13--add-bun-neo-bench-for-tick-cost) and [divergence traces](./phases/1a.md#1a-12--report-the-first-divergent-tick) are also done on main through PR #47 (`f710103`) and PR #48 (`d0fd2ca`); do not reimplement them.

## Now: phase 1b (debug mode)

- [ ] [1B-11 · Terrain chunk LOD and culling](./phases/1b.md#1b-11--add-terrain-chunk-lod-and-culling). PR type: engine.
- [ ] [1B-30 · Placement failure overlays](./phases/1b.md#1b-30--show-authoritative-placement-failures). PR type: engine.
- [ ] [1B-33 · Scenario exports and session deep links](./phases/1b.md#1b-33--reproduce-sessions-with-scenario-exports-and-deep-links). PR type: engine.
- [ ] [1B-38 · Model LOD and culling](./phases/1b.md#1b-38--animate-projected-models-and-choose-model-lod): idle/move animation and independent playback already work; finish available authored LOD selection and measure frame cost. PR type: engine.
- [ ] [1B-39 · Browser key-capture evidence](./phases/1b.md#1b-39--check-browser-key-capture). PR type: tooling.
- [ ] [1B-48 · Navigation CLI benchmark](./phases/1b.md#1b-48--benchmark-navigation-in-the-existing-cli). PR type: tooling.

## In progress or awaiting delivery

- [ ] [1B-32 · Debug overlays](./phases/1b.md#1b-32--draw-debug-overlays-from-worker-diagnostics). PR type: engine; copied grid/height/nav/path diagnostics, with unavailable fog disabled.

## Delivered foundations

All existing 54 units, 45 structures and 37 props have first-pass model references. Remaining Alliance of Free Nations artwork merged in PR #70–89 and Phoenix Initiative artwork in PR #90–112, one definition folder per art PR. Strict animation/team-color validation follows the integrated art. Final art direction remains an owner decision.

The map-aware worker/debug client includes authoritative placement, terrain navigation, reachability, shared path budgets, movement and occupancy repathing; model instances, team colors and idle/move playback; inspector/time controls, selection/box selection and distinct move/stop/attack-move commands. Graphics presets, structure foundations and animated water/shore foam complete the current renderer delivery batch. Combined repository/content/browser validation is run at the end of this batch; merged implementation alone is not a phase-exit claim.

The [water-domain table](./decisions/2026-11-01-movement-water-table.md) and [debug placement exception](./decisions/2026-11-01-debug-spawn-placement.md) are accepted. Real node binding and normal-match placement-radius/clearance policy remain [owner-blocked](./human-tasks.md). Full fog, combat and economy remain phase 2. The [phase-1b exit](./roadmap.md#exit-criteria), including measured 200-unit medium frame rate, is still open.
