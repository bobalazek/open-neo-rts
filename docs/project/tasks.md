# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. One task, one pull request of the type shown ([pull-requests.md](../contributing/pull-requests.md)). Dependencies, scope and acceptance criteria live in the [phase plans](./phases/README.md); work blocked on a person goes in [human-tasks.md](./human-tasks.md).

## Phase 1a: delivery status

The [phase-1a exit](./phases/1a.md#exit-criteria) is met: PR #46 passed Bun and Chromium, Firefox and WebKit [in CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) and merged at `6519ae8`. The [benchmark](./phases/1a.md#1a-13--add-bun-neo-bench-for-tick-cost) and [divergence traces](./phases/1a.md#1a-12--report-the-first-divergent-tick) are also done on main through PR #47 (`f710103`) and PR #48 (`d0fd2ca`); do not reimplement them.

## Now: phase 2 (functional gameplay)

The owner [authorized gameplay before performance acceptance](./decisions/2026-11-02-gameplay-before-performance.md) and [delegated provisional implementation choices](./decisions/2026-11-02-provisional-implementation-autonomy.md). Phase 1b remains unfinished; its FPS/native-key work is deferred. Choose coherent defaults, record them and keep building; human tasks are later tuning/review work rather than repeated approval stops.

- [ ] [2-15b3 · Remaining non-damage warheads and timed effects](./phases/2.md#2-15--warheads-damage-and-timed-effects). PR type: engine after EMP/burn; slow, required reveal/spawn and persistent ground effects remain.
- [ ] [2-22c · Controller APM and per-type/time-series statistics](./phases/2.md#2-22--caps-defeat-victory-and-match-statistics). PR type: engine; actual accepted orders and sampled gameplay totals after canonical summary counters.
- [ ] [2-40b · Finish seeded complete-match qualification](./phases/2.md#2-40--seeded-ai-vs-ai-match-runner). PR type: tooling after concrete bot fixes; persistent runner is implemented, but capped matches are incomplete and20 full-game outcomes remain unqualified.
- [ ] [2-21b1c · Clipped construction depth passes](./phases/2.md#2-21--present-combat-and-construction-events). PR type: engine; later visual polish after functional lifecycle work, replacing the current no-shadow policy for partial structures.
- [ ] [2-21b3a · Diagnose intermittent first-sample debris colors](./phases/2.md#2-21--present-combat-and-construction-events). PR type: engine or tooling after diagnosis; parallel browser captures sometimes show white initial debris, while later and independent first-only captures have correct colors. Preserve contrary evidence; polish after builder clearance.
- [ ] [2-31b · Complete save/load, audio and rebinding settings](./phases/2.md#2-31--in-game-pausemenu-and-device-settings). PR type: engine after the actual save/audio/input systems; the normal menu and core device preferences are implemented.
- [ ] [2-32b2 · Replay playback and detailed results](./phases/2.md#2-32--post-match-results-replay-and-restart). PR type: engine after the viewer and actual per-type/APM/history producers; summary totals and terminal input-record download are implemented.
- [ ] [2-35b · Full replay metadata, keyframes and viewer](./phases/2.md#2-35--replay-recording-keyframes-and-viewer). PR type: engine after validated snapshot restore; terminal input records already verify by replaying the canonical setup and external commands.

The connected normal skirmish now includes actual economy/build/production, hauling/extraction, vision/fog, combat/projectiles/death, the hosted opposing bot, HUD/minimap and canonical victory/surrender with result/rematch navigation. SIM37 adds authored Bunker passenger weapons with retained reload and private cargo state after boarding/unloading/ejection and Siege/Bunker mode modifiers. All 137 authored definitions compile. Full phase-2 acceptance, remaining roster signatures, save/replay/menu/audio and later phases remain work; a single complete AI-vs-AI trial is not the full exit.

## Deferred phase-1b acceptance

- [ ] [1B-39 · Browser key-capture evidence](./phases/1b.md#1b-39--check-browser-key-capture). PR type: tooling.
- [ ] [1B-58 · Close the measured renderer frame-budget miss](./phases/1b.md#1b-58--close-the-qualified-renderer-frame-budget-miss). PR type: engine after profiling; issue #167.

[1B-51 · Counted start-anchor preparation](./phases/1b.md#1b-51--bound-continuous-start-anchor-fallback-work) merged in PR #157. Its CI benchmark failure exposed repeated singleton admission work, corrected by [1B-54](./phases/1b.md#1b-54--avoid-repeated-singleton-queue-admission-work) with unchanged SIM8 state, benchmark and watchdog. This correction and the [affine shadow fit](./phases/1b.md#1b-53--project-dynamic-shadow-bounds-by-affine-half-axes) passed assembled repository checks and all six jobs in [CI 41375970207](https://github.com/bobalazek/open-neo-rts/actions/runs/41375970207) at main `330584c`.
## Delivered foundations

All existing 54 units, 46 structures (including the shared Resource Extractor) and 37 props have first-pass model references. Remaining Alliance of Free Nations artwork merged in PR #70–89 and Phoenix Initiative artwork in PR #90–112, one definition folder per art PR. Strict animation/team-color validation follows the integrated art. Final art direction remains an owner decision.

The map-aware worker/debug client includes authoritative placement, terrain navigation, reachability, shared path budgets, movement and occupancy repathing; model instances, team colors and idle/move playback; inspector/time controls, selection/box selection and distinct move/stop/attack-move commands. Graphics presets, structure foundations and animated water/shore foam complete the current renderer delivery batch. Assembled main `11e7694` passed repository/content/three-browser [CI 41366189139](https://github.com/bobalazek/open-neo-rts/actions/runs/41366189139); measured performance and the remaining phase-exit clauses stay open.

The [water-domain table](./decisions/2026-11-01-movement-water-table.md), [debug placement exception](./decisions/2026-11-01-debug-spawn-placement.md), [neutral extractor policy](./decisions/2026-11-01-neutral-extractor.md), [extractor economy](./decisions/2026-11-02-extractor-economy.md), [ground targeting](./decisions/2026-11-02-ground-targets-structures.md) and [normal construction rules](./decisions/2026-11-02-normal-construction.md) are accepted. Missing paid headquarters recipes remain unavailable. Full fog, combat and ore logistics remain phase 2. The [phase-1b exit](./roadmap.md#exit-criteria), including measured 200-unit medium frame rate, is still open.
