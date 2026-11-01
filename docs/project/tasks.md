# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. One line each, linking what specifies it. Work blocked on a person goes in [human-tasks.md](./human-tasks.md). Each task becomes one pull request of the type shown ([pull-requests.md](../contributing/pull-requests.md)).

## Now: finish phase 0 (content model)

- [ ] Migrate every unit and structure definition in `content/core` to the current schema: weapons as launcher → projectile → warheads with per-armour `versus`, `role` on every unit and structure, structures without `producedBy` (builders construct them). Spec: [combat-and-balance.md](../design/combat-and-balance.md), [content-format.md](../contributing/content-format.md). PR type: content.
- [ ] Faction start kits: two builders each (Combat Engineer, Field Technician, Nanite Constructor), produced at their headquarters. Spec: [factions/README.md](../design/factions/README.md#the-builder). PR type: content.
- [ ] Add the Quantum Nexus wonder as a neutral structure (`content/core/neutral/structures/quantum-nexus/`). Spec: [structures.md](../design/structures.md#wonders). PR type: content.
- [ ] Update `checkPacks` and its tests for builders (structures no longer have `producedBy`) and roles (exactly one `headquarters` and at least one `builder` per faction). Spec: [content-pipeline.md](../engineering/content-pipeline.md). PR type: tooling.
- [ ] Regenerate `content/schemas` and make `bun neo validate` pass with zero errors. PR type: tooling.

## Phase 1a: deterministic simulation

- [ ] `packages/deterministic`: sfc32 PRNG streams seeded via splitmix32, `divFloor`, `mulDiv`, `isqrt`, with golden tests. Spec: [numerics.md](../engineering/numerics.md). PR type: engine.
- [ ] `packages/deterministic`: trig lookup table (generated once, committed) and integer CORDIC `atan2`, with golden tests. PR type: engine.
- [ ] `packages/deterministic`: canonical state hash (FNV-1a + Murmur3 lanes). PR type: engine.
- [ ] `packages/sim/src/ecs`: entity IDs, typed-array component storage, queries, isolated worlds, versioned serialization. Spec: [architecture.md §6](../engineering/architecture.md#6-ecs-conventions). PR type: engine.
- [ ] `packages/sim/src/kernel`: tick loop, phase scheduler with `register` and `registerController` hooks. Spec: [architecture.md §5](../engineering/architecture.md#5-determinism-contract). PR type: engine.
- [ ] `packages/sim/src/commands`: command envelope, canonical ordering, rejection codes. PR type: engine.
- [ ] `packages/sim/src/features/movement`: move order on a flat grid (first feature). PR type: engine.
- [ ] `bun neo run <scenario> --seed N`: runs a command log, prints checkpoint hashes. Spec: [testing.md](../engineering/testing.md#2-determinism-harness). PR type: tooling.
- [ ] Golden-hash tests in Bun and in Chromium, Firefox and WebKit (Playwright); add to CI. PR type: tooling.

## Phase 1b: seeing it

- [ ] Renderer: RTS camera, blocky terrain chunks with height levels and ramps. Spec: [rendering.md](../engineering/rendering.md), [terrain-and-biomes.md](../design/terrain-and-biomes.md). PR type: engine.
- [ ] Single-player sim worker and per-seat projection, rendered by the client. Spec: [fog-of-war.md](../design/fog-of-war.md#how-it-works). PR type: engine.
- [ ] Pathfinding: A* on nav grids per movement domain, path budgets per Force. Spec: [pathfinding.md](../engineering/pathfinding.md). PR type: engine.
- [ ] Selection, box select, move and attack-move; key-capture spike for browser-reserved keys. Spec: [match-hud.md](../design/screens/match-hud.md), [hotkeys.md](../design/hotkeys.md). PR type: engine.
