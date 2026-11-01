---
name: add-sim-feature
description: Add or change a deterministic simulation feature or system in open-neo-rts (packages/sim, ecs, physics, deterministic) — e.g. movement, combat, economy, fog, territory, a new command type or component. Use for any change to authoritative game logic.
---

# Add a simulation feature

Read [architecture.md §5–7](../../../docs/engineering/architecture.md#5-determinism-contract) and [testing.md](../../../docs/engineering/testing.md) before writing code.

## Layout

A feature lives in `packages/sim/src/features/<feature>/` and owns its components, systems, commands and tests. It exports its public contract from `index.ts`, including a `register(world)` entry point. Read an existing feature first and mirror its shape.

## Steps

1. **Place it in the tick.** Decide which phase of the tick order the system runs in (architecture §5). If the phase order must change, that's a simulation version bump; call it out to the user.
2. **Components:** plain integer data. Use typed-array storage for hot numeric fields. Keep variable-length state in feature-owned tables keyed by stable entity IDs. Make it serializable and include it in the state hash.
3. **Commands:** player-facing changes come in as commands with validation (permissions/grants, ownership, visibility, costs). Reject with a reason code; never drop silently.
4. **Determinism checklist:**
   - Use fixed-point math from `packages/deterministic`. No floats in state, no `Math.sin`/`cos`.
   - Use a subsystem PRNG stream from the world, never `Math.random`.
   - Iterate in a stable order (sorted entity IDs); no order-dependent `Map`/`Set` iteration.
   - No time sources: time is the tick.
   - Work budgets are counted in units of work, not milliseconds.
5. **Data-driven:** values that content might vary (ranges, rates, costs) come from definitions, not constants.
6. **Tests**, colocated `*.test.ts`:
   - unit tests for the system's logic;
   - a determinism test: a scenario runs twice and yields identical hashes;
   - acceptance tests from the docs, if the feature has any.
7. **Golden hashes:** if existing scenario outcomes change, update the goldens and bump the simulation version in the same change. Explain why.
8. Run `bun run fix && bun run typecheck && bun run test`.

## Don'ts

- Don't import render, React, networking or DOM code into sim packages.
- Don't add third-party libraries for gameplay logic.
- Don't create empty folders or stubs for future features.
