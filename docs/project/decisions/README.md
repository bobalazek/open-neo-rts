# Decisions

- [2026-11-03 — Native battlefield command station](./2026-11-03-native-battlefield-station.md) — Right circular map, integrated selection/commands, icon tooltips and render-scale-safe input.

- [2026-11-03 — Native save galleries and results](./2026-11-03-native-load-and-results.md) — Babylon thumbnails, final tables/history and keyboard scrolling preserve the existing storage and result controllers.

- [2026-11-03 — Canonical remains](./2026-11-03-canonical-remains.md) — Separate inert wrecks/rubble, shared bounded decay and current-sight projections.

- [2026-11-03 — Bot reinforcement quota](./2026-11-03-bot-reinforcement-quota.md) — Combat-ready and queued troops count toward the existing limit; retreat reserves do not prevent reinforcements.

- [2026-11-02 — Local Force notices and explored-cell pings](./2026-11-02-local-force-notices.md) — Bounded offline notices and local annotations use only copied permitted observations.

- [2026-11-02 — First canonical match counters](./2026-11-02-provisional-match-statistics.md) — Actual production, combat and resource totals, with private live observations and frozen public final results.

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

- [2026-11-03 — A battlefield-first match HUD](./2026-11-03-battlefield-hud.md) — Compact RTS command stations with original portraits, numeric recipe costs and accessible explanations.

- [2026-11-03 — Coherent delivery batches and consolidated history](./2026-11-03-coherent-delivery-batches.md) — Task-sized PRs, small related batches and one squash commit per reviewed PR; original main history retained in a local backup.

- [2026-11-02 — First defeat resolution](./2026-11-02-provisional-defeat-resolution.md) — Existing elimination predicates, unanimous scoped surrender and bounded terminal replay.

- [2026-11-02 — Provisional basic bot](./2026-11-02-provisional-basic-bot.md) — Existing Eastern Collective roster, paid build order, permitted scouting and bounded recovery.

- [2026-11-02 — Provisional projectile resolution](./2026-11-02-provisional-projectile-resolution.md) — Physical uphill misses, authored damage and contact-time geometry under delegated defaults.

- [2026-11-02 — Provisional Field Technician repair](./2026-11-02-provisional-builder-repair.md) — Manual adjacent structure repair at 10 HP/second and 25% full-repair credit price under delegated defaults.

Newest first.

- [2026-11-02 — Implement defaults without repeated questions](./2026-11-02-provisional-implementation-autonomy.md) — Owner delegates provisional gameplay decisions and wants continuous implementation.
- [2026-11-02 — Provisional normal-field ore economy](./2026-11-02-ore-economy.md) — Field-total stock, mining/unloading and neighbour-seeded regrowth rates.
- [2026-11-02 — Terrain and opaque props first for visibility](./2026-11-02-first-playable-vision.md) — Implement base fog before undefined building/smoke/reveal rules.

- [2026-11-02 — Legal production exits and art sockets](./2026-11-02-production-exit-geometry.md) — Explicit rotated exits, radius-aware legal spawn positions and truthful blocked queues.

- [2026-11-02 — Barracks Complex has two production slots](./2026-11-02-production-slots.md) — One active slot elsewhere, pay at start and retain the five-item queue limit.

- [2026-11-02 — Provisional shared extractor economy](./2026-11-02-extractor-economy.md) — 800 credits, 20 seconds, accepted power/output/depletion rules.
- [2026-11-02 — Ground weapons include structures](./2026-11-02-ground-targets-structures.md) — Existing structure damage multipliers apply.

- [2026-11-02 — Builder assistance has a 25% floor](./2026-11-02-builder-assistance.md) — Contributions are 100%, 75%, 50%, then 25% from each additional builder.

- [2026-11-02 — Normal construction radius, clearance and payment](./2026-11-02-normal-construction.md) — Six/three-cell radius, 40-tick clearance, payment at site creation and full unfinished cancellation refund.

- [2026-11-02 — Existing Eastern Collective tier 1 is provisional first-playable content](./2026-11-02-first-playable-scope.md) — Use existing authored numbers in the Training Grounds mirror, then balance after the loop works.

- [2026-11-02 — Build gameplay before finishing performance acceptance](./2026-11-02-gameplay-before-performance.md) — Proceed with functional gameplay while keeping unfinished phase-1b acceptance explicit.

- [2026-11-01 — One neutral extractor for both node types](./2026-11-01-neutral-extractor.md) — Any faction builds the shared neutral structure on raw-material or oil nodes.

- [2026-11-01 — Movement domains and water](./2026-11-01-movement-water-table.md) — One accepted water table; wheeled shallow movement is 50% speed and air uses no grid.

- [2026-11-01 — Debug spawning skips build radius](./2026-11-01-debug-spawn-placement.md) — Terrain, bounds and occupied cells remain authoritative; normal construction policy stays owner-gated.

- [2026-11-01 — Standard unit animation and team colour](./2026-11-01-unit-animation-contract.md) — Every unit has idle/move, armed units attack, infantry death, and owned models use team materials on geometry.
- [2026-11-01 — Agent-made assets are credited to the owner](./2026-11-01-agent-made-asset-author.md) — Models, props and textures made by a coding agent at the owner's direction name Borut Balazek as author.
- [2026-11-01 — Debug mode is the first visual milestone](./2026-11-01-debug-mode-first.md) — Phase 1b delivers a dev-only mode to spawn anything on any map and inspect the sim, with sandbox maps and end-to-end tests.
- [2026-11-01 — First-pass models before the art sign-off](./2026-11-01-first-pass-models.md) — Hand-made blocky models for the tier-1 Eastern Collective roster, refined or replaced once the art direction is signed off.
- [2026-11-01 — From phase 1, every task lands as one pull request](./2026-11-01-work-through-prs.md) — Strict per-task/per-type rule relaxed by [coherent delivery batches](./2026-11-03-coherent-delivery-batches.md).
- [2026-11-01 — Co-located content, rules in code](./2026-11-01-content-model.md) — Definitions own their weapons, abilities, strings and assets; resources, armour classes and roles are engine code.
- [2026-11-01 — Weapon, projectile, warheads](./2026-11-01-weapon-model.md) — Attacks are a launcher, a projectile and warheads with per-armour multipliers, inline in each unit.
- [2026-11-01 — Builders construct structures](./2026-11-01-builders.md) — Every faction has a builder role that constructs on site, repairs, captures and works on wonders.
- [2026-11-01 — Server-authoritative deterministic simulation](./2026-11-01-server-authority.md) — Integer-only sim, server decides, clients get visibility-filtered state; no client lockstep.
- [2026-11-01 — Own core, borrowed infrastructure](./2026-11-01-build-vs-use.md) — We write ECS, physics, pathfinding, AI and protocol; we use Bun, Turborepo, Biome, Babylon.js, React and Colyseus.
- [2026-11-01 — No web meta-framework](./2026-11-01-no-meta-framework.md) — The client is a single-page game: React, wouter, Zustand and Bun's bundler; Tauri for desktop.
