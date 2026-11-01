# Handoff

Recovery of `feat/phase-1-models-and-props` on 2026-11-01. The saved WIP commit was `b0a1a16`. Its biome layer was partially integrated: sandbox generators lacked the layer and the renderer still called the old terrain API. Both are repaired without regenerating assets.

## Done (on main via PR #1, or committed on this branch)

- Phase 0: content migrated (weapons, roles, builders at headquarters, Quantum Nexus), 0 validation errors.
- Phase 1a: `packages/deterministic` (PRNG, integer math, trig, state hash, browser golden digests), sim ECS, commands, kernel, entities and movement features, structure placement rules.
- Phase 1b: map terrain layers and validation, four sandbox maps, terrain renderer with RTS camera (`bun --port=4318 apps/web/index.html`), `bun neo build-models`, 42 tier-1 brick models (14 per faction), 37 props, resource visuals, generated textures.

## Remaining work

The earlier handoff overstated saved progress: model rendering, motion-clip changes, pathfinding and the scenario runner have no implementation in the WIP commit. Their feature folders are placeholders, not suspended agents.

- The biome layer, validation and terrain colouring are implemented; `sandbox-biomes` and Training Grounds terrain remain.
- Render models and props on the map.
- Add motion clips and validation: vehicle movement, rotor and radar loops, exit doors.
- Add pathfinding.
- Add `bun neo run` and scenario golden hashes.
- Finish per-phase task planning beyond [phase 1a](./phases/1a.md).

## Next

1. Merge the verified recovery branch through PR #2.
2. Continue with `bun neo run`, then the items above, one PR each ([decision](./decisions/2026-11-01-work-through-prs.md)).
3. Then the rest of phase 1b: debug mode panels, sim worker and projection, selection, end-to-end tests. See [roadmap.md](./roadmap.md) and [tasks.md](./tasks.md).

Pending owner decisions are in [human-tasks.md](./human-tasks.md). Working rules are in [AGENTS.md](../../AGENTS.md).
