# Decisions

One file per non-obvious decision. Append-only: once written, an entry isn't edited; a reversal is a new entry that references the old one. The bar for writing one: "would a future contributor re-argue this?"

## How to add one

1. Create `decisions/YYYY-MM-DD-short-slug.md`.
2. Use the template below.
3. Add one line to the index.

```markdown
# YYYY-MM-DD — Short decision title

**Context.** What forced the decision, and the options.

**Decision.** What we picked.

**Consequences.** What it means for future work, including what we give up.
```

## Index

Newest first.

- [2026-11-01 — Movement domains and water](./2026-11-01-movement-water-table.md) — One accepted water table; wheeled shallow movement is 50% speed and air uses no grid.

- [2026-11-01 — Debug spawning skips build radius](./2026-11-01-debug-spawn-placement.md) — Terrain, bounds and occupied cells remain authoritative; normal construction policy stays owner-gated.

- [2026-11-01 — Agent-made assets are credited to the owner](./2026-11-01-agent-made-asset-author.md) — Models, props and textures made by a coding agent at the owner's direction name Borut Balazek as author.
- [2026-11-01 — Debug mode is the first visual milestone](./2026-11-01-debug-mode-first.md) — Phase 1b delivers a dev-only mode to spawn anything on any map and inspect the sim, with sandbox maps and end-to-end tests.
- [2026-11-01 — First-pass models before the art sign-off](./2026-11-01-first-pass-models.md) — Hand-made blocky models for the tier-1 Eastern Collective roster, refined or replaced once the art direction is signed off.
- [2026-11-01 — From phase 1, every task lands as one pull request](./2026-11-01-work-through-prs.md) — One task, one branch, one PR of one type, green CI before merge.
- [2026-11-01 — Co-located content, rules in code](./2026-11-01-content-model.md) — Definitions own their weapons, abilities, strings and assets; resources, armour classes and roles are engine code.
- [2026-11-01 — Weapon, projectile, warheads](./2026-11-01-weapon-model.md) — Attacks are a launcher, a projectile and warheads with per-armour multipliers, inline in each unit.
- [2026-11-01 — Builders construct structures](./2026-11-01-builders.md) — Every faction has a builder role that constructs on site, repairs, captures and works on wonders.
- [2026-11-01 — Server-authoritative deterministic simulation](./2026-11-01-server-authority.md) — Integer-only sim, server decides, clients get visibility-filtered state; no client lockstep.
- [2026-11-01 — Own core, borrowed infrastructure](./2026-11-01-build-vs-use.md) — We write ECS, physics, pathfinding, AI and protocol; we use Bun, Turborepo, Biome, Babylon.js, React and Colyseus.
- [2026-11-01 — No web meta-framework](./2026-11-01-no-meta-framework.md) — The client is a single-page game: React, wouter, Zustand and Bun's bundler; Tauri for desktop.
