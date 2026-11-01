# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. One line each, linking what specifies it. Work blocked on a person goes in [human-tasks.md](./human-tasks.md). Each task becomes one pull request of the type shown ([pull-requests.md](../contributing/pull-requests.md)).

## Now: phase 1a (engine foundations)

- [ ] `packages/sim/src/features/movement`: move order on a flat grid (first feature). PR type: engine.
- [ ] `bun neo run <scenario> --seed N`: runs a command log, prints checkpoint hashes. Spec: [testing.md](../engineering/testing.md#2-determinism-harness). PR type: tooling.
- [ ] Scenario golden hashes: once `bun neo run` exists, check its checkpoint hashes in Bun and, through the Playwright helper in `apps/web/e2e/determinism.e2e.ts`, in Chromium, Firefox and WebKit. PR type: tooling.

## Next: phase 1b (debug mode)

- [ ] Biome regions: a `biome` map layer (values in `rules/terrain.ts`), then the `sandbox-biomes` map with four quadrants. Spec: [terrain-and-biomes.md](../design/terrain-and-biomes.md#biomes). PR type: engine, then map.
- [ ] Renderer follow-ups: load real maps instead of the demo grid, shadows and quality presets, animated water and shore foam, chunk LOD, foundations under structures. Spec: [rendering.md](../engineering/rendering.md). PR type: engine.
- [ ] Single-player sim worker and per-seat projection, rendered by the client. Spec: [fog-of-war.md](../design/fog-of-war.md#how-it-works). PR type: engine.
- [ ] Debug mode at `/debug`: map picker, Forces, spawn palette, inspector, overlays, time controls, command-log export, deep links. Spec: [debug-mode.md](../design/screens/debug-mode.md). PR type: engine.
- [ ] Placement rules in the sim: footprint cell rules `land`, `shore`, `water`, `node`, build radius and clearance, shown in debug mode. Spec: [structures.md](../design/structures.md#placement). PR type: engine.
- [ ] Pathfinding: A* on nav grids per movement domain, path budgets per Force. Spec: [pathfinding.md](../engineering/pathfinding.md). PR type: engine.
- [ ] Selection, box select, move and attack-move; key-capture spike for browser-reserved keys. Spec: [match-hud.md](../design/screens/match-hud.md), [hotkeys.md](../design/hotkeys.md). PR type: engine.
- [ ] First-pass models for the tier-1 Eastern Collective units and structures, following the model conventions. Spec: [assets.md](../contributing/assets.md#model-conventions), [decision](./decisions/2026-11-01-first-pass-models.md). PR type: art (one per unit or structure).
- [ ] End-to-end tests: Playwright against `bun run dev`, opening debug mode on `sandbox-flat`, spawning, moving and checking the state hash; add to CI. Spec: [testing.md](../engineering/testing.md). PR type: tooling.
