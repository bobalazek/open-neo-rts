# Handoff

Snapshot on 2026-11-01. The [task queue](./tasks.md) and [phase-1b plan](./phases/1b.md) distinguish remaining work from delivered foundations. The owner requests implementation in coherent batches, with full validation at the end of each batch.

## Delivered foundations

- Phase 1a is complete: deterministic integer math, ECS, command kernel, CLI runner, replay/checkpoint hashes, divergence traces and benchmark. The two-Force 10,000-tick scenario passed Bun and Chromium, Firefox and WebKit in [CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715).
- Authored sandbox maps and Training Grounds include height, ramp, water, surface and biome layers. The client loads their actual terrain and decorations. Version-2 scenarios include the owned map/setup in canonical state.
- All 54 existing units, 45 structures and 37 props have first-pass model references. Eastern Collective artwork and the Quantum Nexus were delivered earlier; remaining Alliance of Free Nations folders merged in PR #70–89 and Phoenix Initiative folders in PR #90–112. Original source, icons, required remains, animation clips and provenance accompany each owning art PR. Strict validation enforces unit idle/move, armed attack, infantry death and active-scene team-color geometry. Final art direction remains unapproved.
- The worker owns the simulation. `/debug` consumes copied per-seat projections and separate explicit debug diagnostics; ordinary seats retain grant restrictions. Pure map/definition exports prevent accidental main-thread ECS initialization. Model caches, rigid instances, isolated Force colors and interpolated idle/move playback are integrated.
- Debug spawning enforces terrain, map bounds, resources and occupied cells. Navigation compiles the accepted movement domains with integer costs and clearance. Reachability, incremental A*, a shared 4,096-node Force scheduler, swept path following and occupancy repathing are integrated. Stop, replacement, death and removal cancel stale work; bounded retries expose failures. The latest simulation version is 6.
- Inspector, health/kill/remove, acknowledged tick/hash and pause/step/speed controls are implemented. Click/add/toggle/box selection uses opaque projected handles. Move, stop and attack-move pass through granted worker commands. Attack-move records a distinct movement intent; targeting and combat remain phase 2.
- Low/Medium/High/Ultra graphics presets, calibrated shadows and biome-colored structure foundations are integrated with selection and model lifecycle. Animated water uses continuous world UVs and wet-side shoreline foam, with resources released on map replacement. Hover and amphibious models use the water surface. Unit attack/death clips and vehicle/door clips are inspectable assets; gameplay triggers wait for their corresponding simulation features.

## Validation and limits

The current delivery batch has independent source review and scoped author checks. Repository, content and three-browser CI run together on the final assembled main commit. Do not treat a merged intermediate commit or source-review gate as a final CI receipt.

Measured navigation on a 128×128 map with 200 units starts every open-map order on the first tick. With an obstructing structure, all units begin moving by tick 23 (1.15 seconds); measured movement p95 was about 14.17 ms, hash p95 1.58 ms and cold compilation peaked near 89 ms. These are CPU/response measurements, not a 60 fps proof. The [phase-1b exit](./roadmap.md#exit-criteria) remains open.

## Continue phase 1b

Copied worker grid/height/navigation/path overlays are in progress. The queue also contains terrain/model LOD and culling, cell-level placement overlays, reproducible scenario exports/deep links, browser key-capture evidence, complete spawn/move/hash CI proof, browser performance counters and the navigation benchmark. Implement the dependency-ready tasks, one focused PR each; run validation once per coherent batch.

The owner accepted the [water-domain table](./decisions/2026-11-01-movement-water-table.md) and [debug build-radius exception](./decisions/2026-11-01-debug-spawn-placement.md). Normal construction radius/first-structure/clearance rules, real node-bound content, combat structure targeting and first-playable scope remain [owner decisions](./human-tasks.md). Do not silently choose values or invent roster entries to unblock them.

Working rules: [AGENTS.md](../../AGENTS.md). Phase 2 adds the first playable economy, construction, combat and bot; online play follows the roadmap. No phase-completion claim is made here.
