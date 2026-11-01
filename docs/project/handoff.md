# Handoff

State as of 2026-11-01, branch `feat/phase-1-models-and-props`. The last commit on it is **work in progress**: several agents were stopped mid-task when usage ran out. Run `bun run fix`, `bun run typecheck`, `bun run test` and `bun neo validate` first, and expect some failures from that in-progress work.

## Done (on main via PR #1, or committed on this branch)

- Phase 0: content migrated (weapons, roles, builders at headquarters, Quantum Nexus), 0 validation errors.
- Phase 1a: `packages/deterministic` (PRNG, integer math, trig, state hash, browser golden digests), sim ECS, commands, kernel, entities and movement features, structure placement rules.
- Phase 1b: map terrain layers and validation, four sandbox maps, terrain renderer with RTS camera (`bun --port=4318 apps/web/index.html`), `bun neo build-models`, 42 tier-1 brick models (14 per faction), 37 props, resource visuals, generated textures.

## In progress when stopped (in the WIP commit; finish or discard)

- Biome-region map layer, `sandbox-biomes`, Training Grounds terrain (packages/content maps, render terrain, the sandbox generator).
- Rendering models and props on the map, with Babylon's glTF loader (packages/render units and structures, packages/client debug feature).
- Motion clips and validation: vehicle `move` clips, rotor and radar loops, `socket_exit` with `open`/`close` doors, role-based required clips (packages/content/src/assets).
- Pathfinding (packages/sim/src/features/movement).
- `bun neo run` and scenario golden hashes (packages/sim/src/testing, apps/cli run command, apps/web/e2e).
- The per-phase task plan in `docs/project/phases/` (partial).

## Next

1. Get the branch green, then open and merge PR #2.
2. Finish the items above, one PR each ([decision](./decisions/2026-11-01-work-through-prs.md)).
3. Then the rest of phase 1b: debug mode panels, sim worker and projection, selection, end-to-end tests. See [roadmap.md](./roadmap.md) and [tasks.md](./tasks.md).

Pending owner decisions are in [human-tasks.md](./human-tasks.md). Working rules are in [AGENTS.md](../../AGENTS.md).
