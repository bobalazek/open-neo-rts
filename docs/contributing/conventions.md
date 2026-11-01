# Conventions

How everything in this repo is named and written. These rules are checked in review ([review-checklists.md](review-checklists.md)), and where possible by CI (Biome, typecheck, `bun neo validate-assets`). If something isn't covered here, follow the nearest existing example and add the rule in the same PR.

## Names at a glance

| Thing                                   | Convention                                                                                                                          | Example                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Folders and files (code, docs, content) | `kebab-case`                                                                                                                        | `power-plant.json`, `validate-model.ts` |
| Packages                                | `@open-neo-rts/<name>`, folder = name                                                                                               | `@open-neo-rts/sim` in `packages/sim`   |
| Apps                                    | `@open-neo-rts/app-<name>`, folder = name                                                                                           | `@open-neo-rts/app-web` in `apps/web`   |
| Content packs                           | `kebab-case` ID = folder name                                                                                                       | `core`, `dev`                           |
| Definition IDs                          | `<kind>:<name>` within a pack; `<pack>.<kind>:<name>` across packs                                                                  | `unit:tank`, `core.resource:credits`    |
| Definition files                        | `<pack>/<kinds>/<name>.json`, one definition per file, file name = ID name                                                          | `dev/units/tank.json`                   |
| JSON fields                             | `camelCase`                                                                                                                         | `buildTime`, `producedBy`               |
| Locale keys                             | kebab-case segments joined by dots: `<kind>.<name>.<field>` for content; `ui.<screen>.<element>` for UI (UI strings live in `core`) | `unit.tank.name`, `ui.lobby.ready`      |
| Runtime model                           | `<pack>/assets/<kinds>/<name>/<name>.glb`                                                                                           | `dev/assets/units/tank/tank.glb`        |
| Wreck / rubble model                    | `<name>.wreck.glb`, `<name>.rubble.glb`                                                                                             | `tank.wreck.glb`                        |
| Icon                                    | `<name>.icon.png`                                                                                                                   | `tank.icon.png`                         |
| Sound                                   | `<name>.<event>.ogg`; variations `<name>.<event>.<n>.ogg`                                                                           | `tank.fire.1.ogg`                       |
| Editable source                         | `<pack>/source/<kinds>/<name>/<name>.blend`                                                                                         | `core/source/units/tank/tank.blend`     |
| GLB node names                          | `snake_case`; fixed part names (`hull`, `turret`, `barrel`, `rotor`, `legs`)                                                        | `turret`                                |
| Sockets                                 | `socket_<name>` or `socket_<name>_<n>`                                                                                              | `socket_muzzle_0`                       |
| LOD meshes                              | `<node>` or `<node>_LOD0`, `<node>_LOD1`                                                                                            | `hull_LOD1`                             |
| Damage-state nodes                      | `state_damaged`, `state_critical`                                                                                                   |                                         |
| Material slots                          | `palette`, `team`, `team_dark`, `team_light`, `team_emissive`, `metal`, `glass`, `emissive`                                         |                                         |
| Animation clips                         | `snake_case`                                                                                                                        | `idle`, `fire_recoil`                   |
| Maps                                    | `<pack>/maps/<name>/map.json` plus layer files `height.r8`, `ramps.r8`, `surface.r8`, `preview.webp`                                | `core/maps/test-valley/map.json`        |
| Campaigns and missions                  | `<pack>/campaigns/<name>/campaign.json`, `…/missions/<name>/mission.json`                                                           | `core/campaigns/ghost-protocol/`        |
| Sim commands                            | `<area>.<verb>`                                                                                                                     | `unit.move`, `production.queue`         |
| Git branches                            | `<type>/<short-description>`                                                                                                        | `feat/fixed-point-trig`                 |
| Commits                                 | [Conventional Commits](https://www.conventionalcommits.org/) with a scope                                                           | `feat(sim): add path budget per force`  |

`<kinds>` is the plural folder for a definition kind: `units`, `structures`, `weapons`, `abilities`, `research`, `factions`, `presets`, `profiles`, `maps`, `campaigns`. The full content layout and a template for every kind are in [content-format.md](content-format.md).

## TypeScript

**Files and modules**

- One concept per file, named after it in kebab-case: `path-queue.ts` exports `PathQueue` and its helpers. React components live in kebab-case `.tsx` files (`unit-card.tsx` exports `UnitCard`).
- Each feature folder has an `index.ts` that is its public API. Other features import from that index, never from files inside the folder.
- Across packages, import only from the package name (`@open-neo-rts/sim`) or a declared subpath export (`@open-neo-rts/sim/testing`), never `../../other-package/src/…`.
- **Named exports only.** No default exports, so names stay greppable and consistent.

**Naming**

| Kind                                         | Convention                          | Example                                       |
| -------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Variables, functions                         | `camelCase`, verbs for functions    | `queuePath`, `isReachable`                    |
| Booleans                                     | `is`, `has`, `can`, `should` prefix | `hasLineOfSight`                              |
| Types, interfaces, classes, React components | `PascalCase`, no `I` prefix         | `ModelIssue`, `UnitCard`                      |
| ECS components                               | `PascalCase` nouns                  | `Health`, `MoveIntent`                        |
| Systems                                      | `camelCase` ending in `System`      | `movementSystem`                              |
| Module-level constants                       | `UPPER_SNAKE_CASE`                  | `MAX_JOINTS`                                  |
| Units in names when ambiguous                | suffix with the unit                | `rangeSubcells`, `reloadTicks`, `costCredits` |

**Code**

- `strict` TypeScript with `noUncheckedIndexedAccess`. No `any`. Use `unknown` and narrow it at trust boundaries (network input, files, mods).
- Game objects are **plain data plus functions**, not class hierarchies. Classes are fine for long-lived services (a room, a renderer).
- **Sim code** follows the determinism rules ([numerics.md](../engineering/numerics.md)), never throws on player input (bad commands are rejected with a reason code), and never logs. Logging goes through an injected logger in apps.
- Comments explain _why_, not what. `TODO` must reference an issue: `// TODO(#42): …`.
- No new runtime dependency without a reason in the PR ([build vs. use](../engineering/architecture.md#build-vs-use)).
- Biome decides formatting. Don't hand-format, and don't disable rules inline without a comment explaining why.

## Tests

- `bun:test`, colocated as `<file>.test.ts` next to the code.
- Test names describe behaviour: `test("rejects a move into an unreachable cell")`, not `test("move 3")`.
- Every test that involves randomness uses a fixed seed.
- Golden files (expected hashes, expected reports) live in `__golden__/` next to the test. They are updated only together with a simulation version bump ([testing.md](../engineering/testing.md)).
- Shared fixtures come from `@open-neo-rts/sim/testing`.

## Content

- Data files use **human units** (seconds, cells, percent, decimals allowed). The loader converts them to integer sim units once at load, which is exact on every engine ([numerics.md](../engineering/numerics.md#content-units)).
- Every player-visible string is a locale key in a pack's `locales/<lang>.json`; UI strings live in `core` ([localization.md](../engineering/localization.md)).
- Every runtime asset has an `assets.json` entry with its author and source ([assets.md](assets.md)).
- One definition per file, so diffs, reviews and mod overrides stay small.

## Docs

- Docs live in `docs/design` (what the game is), `docs/engineering` (how it's built) and `docs/contributing` (how to add to it). The index is [docs/README.md](../README.md).
- Every doc that describes future work states its phase, or is listed in the roadmap's [phase table](../roadmap.md#what-each-phase-builds).
- File and folder structures are shown as tree diagrams in `text` code blocks, not tables.
- Plain language, short sentences, examples over abstractions.
