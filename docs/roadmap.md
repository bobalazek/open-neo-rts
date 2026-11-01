# Roadmap

Split planning from experimentation, so we don't spend months designing things that turn out to be unfun.

| Phase                    | Deliverable                                                                                                                                                                     | Rough effort*          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 0. Research & design     | Game direction, technical decisions, scope, initial mechanics (these docs)                                                                                                      | 1–2 weeks              |
| 1. Technical prototype   | **1a:** headless ECS sim, deterministic commands and snapshots, identical state hashes across runs. **1b:** Babylon renderer, camera, terrain, selection, movement, pathfinding | 2–4 weeks              |
| 2. First playable        | Base building, resources, combat, victory condition                                                                                                                             | 1–3 months             |
| 3. Vertical slice        | One polished faction, basic AI, one map, a full match                                                                                                                           | 2–4 months             |
| 4. Expansion             | More factions, upgrades, better AI, map editor                                                                                                                                  | Several months         |
| 5. Multiplayer & release | Networking, testing, balancing, distribution                                                                                                                                    | Several months or more |

\*Very approximate elapsed time for one experienced developer working consistently. These are not commitments. Art and multiplayer scope can change them drastically, and phases may overlap.

Determinism is built in from phase 1, even though networking lands in phase 5.

## First milestone (1a): prove determinism before pixels

1. Monorepo, tooling, CI. _(done, except CI)_
2. `packages/deterministic`: PRNG streams, fixed-point math, state hashing.
3. `packages/sim/src/ecs`: our ECS with stable IDs and versioned serialization.
4. `packages/sim`: tick loop, command queue, snapshots, one trivial feature (movement on a flat grid).
5. `bun neo run` (in `apps/cli`): run a scenario from seed + command log and print checkpoint hashes.
6. Golden-hash test: the same scenario yields identical hashes twice in one process, across processes, and in a browser.

Only then: renderer, camera, selection, movement, combat, and the skirmish loop. See [testing.md](engineering/testing.md).

## Gate after phase 1

If controlling a group of tanks around a simple map already feels enjoyable, continue. If not, fix the feel before adding anything else.

## First playable scope

- **One mirrored, generic test faction** on both sides, so balance tests stay symmetric while AFN, EC and PI are designed. Then one official faction becomes the vertical slice.
- A simple bot; see [ai.md](engineering/ai.md#5-first-bot-first-playable).
- Command center, one production building, one resource collector, a few combat units.
- One map, one victory condition.
- Blocky low-poly art, original and simple to start.

## Explicitly later

Campaign and world-map layer, the other two factions, rule modules (territory, eras, trade…), Shared Command / Last Stand / diplomacy, map editor, modding SDK, desktop wrapper.
