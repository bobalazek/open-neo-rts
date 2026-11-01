# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. One task, one pull request of the type shown ([pull-requests.md](../contributing/pull-requests.md)). Dependencies, scope and acceptance criteria live in the [phase plans](./phases/README.md); work blocked on a person goes in [human-tasks.md](./human-tasks.md).

## Phase 1a: delivery status

The [phase-1a exit](./phases/1a.md#exit-criteria) is met: PR #46 passed Bun and Chromium, Firefox and WebKit [in CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) and merged at `6519ae8`. The [benchmark](./phases/1a.md#1a-13--add-bun-neo-bench-for-tick-cost) and [divergence traces](./phases/1a.md#1a-12--report-the-first-divergent-tick) are also done on main through PR #47 (`f710103`) and PR #48 (`d0fd2ca`); do not reimplement them.

## Now: phase 1b (debug mode)

- [ ] [1B-10 · Animated water and shore foam](./phases/1b.md#1b-10--animate-water-and-shore-foam). PR type: engine.
- [ ] [1B-27 · Debug session shell](./phases/1b.md#1b-27--mount-the-debug-session-shell), followed by [configuration](./phases/1b.md#1b-28--choose-maps-seed-and-forces-in-debug-mode) and the [spawn palette](./phases/1b.md#1b-29--spawn-existing-definitions-through-commands): renderer, worker and authoritative debug placement are implemented. PR type: engine, one task per PR.
- [ ] [1B-39 · Browser key-capture evidence](./phases/1b.md#1b-39--check-browser-key-capture). PR type: tooling.

## In progress or awaiting delivery

- [ ] [1B-15 · Alliance of Free Nations first-pass artwork](./phases/1b.md#1b-15--integrate-reviewed-alliance-of-free-nations-artwork): first three folders merged in PR #50–52; remaining accepted source is ongoing, one existing definition folder per art PR.
- [ ] [1B-16 · Phoenix Initiative first-pass artwork](./phases/1b.md#1b-16--integrate-reviewed-phoenix-initiative-artwork): accepted source branch, not yet merged; deliver one existing definition folder per art PR.

The [A* core](./phases/1b.md#1b-21--add-incremental-integer-a-over-an-explicit-grid) is merged in PR #53 (`3eb0b39`). The flat-world [projection](./phases/1b.md#1b-25--define-the-per-seat-presentation-projection) and [worker](./phases/1b.md#1b-26--host-single-player-in-a-web-worker) foundation is merged in PR #54 (`25cce95`). Their terrain, movement and client integration follow the plan's dependencies; full fog remains phase 2.

[Authored map terrain loading](./phases/1b.md#1b-08--load-authored-maps-in-the-terrain-client) is done on main through PR #49 (`b7b4520`), with [green CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341685124). The [remaining dependency graph](./phases/1b.md#dependency-overview) covers terrain LOD, foundations, occupancy, navigation compilation, reachability, Force budgets, movement/repaths, debug panels, selection/orders, model rendering/animation, e2e and measured performance. Promote each task here when its prerequisites land. The [water-domain table](./decisions/2026-11-01-movement-water-table.md) is accepted; real node binding and placement-radius/clearance policy remain owner-blocked. Strict presentation enforcement stays held until the reviewed artwork lands. Phase 2 systems are not part of this queue.
