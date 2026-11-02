# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. One task, one pull request of the type shown ([pull-requests.md](../contributing/pull-requests.md)). Dependencies, scope and acceptance criteria live in the [phase plans](./phases/README.md); work blocked on a person goes in [human-tasks.md](./human-tasks.md).

## Phase 1a: delivery status

The [phase-1a exit](./phases/1a.md#exit-criteria) is met: PR #46 passed Bun and Chromium, Firefox and WebKit [in CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) and merged at `6519ae8`. The [benchmark](./phases/1a.md#1a-13--add-bun-neo-bench-for-tick-cost) and [divergence traces](./phases/1a.md#1a-12--report-the-first-divergent-tick) are also done on main through PR #47 (`f710103`) and PR #48 (`d0fd2ca`); do not reimplement them.

## Now: phase 2 (functional gameplay)

The owner [authorized gameplay before performance acceptance](./decisions/2026-11-02-gameplay-before-performance.md) and [delegated provisional implementation choices](./decisions/2026-11-02-provisional-implementation-autonomy.md). Phase 1b remains unfinished; its FPS/native-key work is deferred. Choose coherent defaults, record them and keep building; human tasks are later tuning/review work rather than repeated approval stops.

- [ ] [2-07 · Harvester mining, hauling and docking](./phases/2.md#2-07--harvester-mining-hauling-and-docking). PR type: engine after 2-06, with accepted mining/unloading values.
- [ ] [2-19 · Filter snapshots, events and bot observations](./phases/2.md#2-19--filter-snapshots-events-and-bot-observations). PR type: engine after 2-18.

Shared pack resolution/content identity (2-01), integer gameplay compilation (2-02), normal starting kits (2-03), stock banks (2-04), power (2-05), paid construction sites/builders (2-09/2-10), node extraction (2-08a/b) and production (2-11a/b) are implemented. SIM18 activates Eastern Collective tier-1 exits and two Barracks slots using the real queue engine; existing costs/times and included Supply Truck remain intact. CLI validation compiles all 137 authored definitions. Ore hauling and permitted enemy observations are next.

## Deferred phase-1b acceptance

- [ ] [1B-39 · Browser key-capture evidence](./phases/1b.md#1b-39--check-browser-key-capture). PR type: tooling.
- [ ] [1B-58 · Close the measured renderer frame-budget miss](./phases/1b.md#1b-58--close-the-qualified-renderer-frame-budget-miss). PR type: engine after profiling; issue #167.

[1B-51 · Counted start-anchor preparation](./phases/1b.md#1b-51--bound-continuous-start-anchor-fallback-work) merged in PR #157. Its CI benchmark failure exposed repeated singleton admission work, corrected by [1B-54](./phases/1b.md#1b-54--avoid-repeated-singleton-queue-admission-work) with unchanged SIM8 state, benchmark and watchdog. This correction and the [affine shadow fit](./phases/1b.md#1b-53--project-dynamic-shadow-bounds-by-affine-half-axes) passed assembled repository checks and all six jobs in [CI 41375970207](https://github.com/bobalazek/open-neo-rts/actions/runs/41375970207) at main `330584c`.
## Delivered foundations

All existing 54 units, 46 structures (including the shared Resource Extractor) and 37 props have first-pass model references. Remaining Alliance of Free Nations artwork merged in PR #70–89 and Phoenix Initiative artwork in PR #90–112, one definition folder per art PR. Strict animation/team-color validation follows the integrated art. Final art direction remains an owner decision.

The map-aware worker/debug client includes authoritative placement, terrain navigation, reachability, shared path budgets, movement and occupancy repathing; model instances, team colors and idle/move playback; inspector/time controls, selection/box selection and distinct move/stop/attack-move commands. Graphics presets, structure foundations and animated water/shore foam complete the current renderer delivery batch. Assembled main `11e7694` passed repository/content/three-browser [CI 41366189139](https://github.com/bobalazek/open-neo-rts/actions/runs/41366189139); measured performance and the remaining phase-exit clauses stay open.

The [water-domain table](./decisions/2026-11-01-movement-water-table.md), [debug placement exception](./decisions/2026-11-01-debug-spawn-placement.md), [neutral extractor policy](./decisions/2026-11-01-neutral-extractor.md), [extractor economy](./decisions/2026-11-02-extractor-economy.md), [ground targeting](./decisions/2026-11-02-ground-targets-structures.md) and [normal construction rules](./decisions/2026-11-02-normal-construction.md) are accepted. Missing paid headquarters recipes remain unavailable. Full fog, combat and ore logistics remain phase 2. The [phase-1b exit](./roadmap.md#exit-criteria), including measured 200-unit medium frame rate, is still open.
