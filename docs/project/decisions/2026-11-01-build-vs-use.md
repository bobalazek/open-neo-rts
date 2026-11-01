# 2026-11-01 — Own core, borrowed infrastructure

**Context.** Gameplay systems (ECS, physics, pathfinding, AI, network protocol) must be deterministic and tuned to this game; general-purpose libraries aren't. Infrastructure (runtime, bundler, renderer, UI, session server) would take years to rebuild.

**Decision.** We write the ECS, deterministic math, gameplay physics, pathfinding, fog of war, AI, the match protocol, and the content tooling. We use Bun, Turborepo, Biome, TypeScript, Babylon.js, React and Colyseus. Any new dependency needs a written reason in its PR.

**Consequences.** More code to own in the core, full control over determinism and performance. Visual-only effects may still use a physics plugin inside the renderer.
