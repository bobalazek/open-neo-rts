# open-neo-rts docs

> **Status: draft.** Nothing here is final; expect heavy edits.

Start with [design/vision.md](design/vision.md). Contributors: see [CONTRIBUTING.md](../CONTRIBUTING.md) and [conventions.md](contributing/conventions.md). What to build now: [roadmap.md](roadmap.md#what-each-phase-builds).

### Design: what the game is

| Doc                                                               | Covers                                                                                                                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [vision.md](design/vision.md)                                     | What we're building, feel, what makes it distinct, licensing                                                                                                               |
| [game-design.md](design/game-design.md)                           | Overview and entry point to everything below                                                                                                                               |
| [factions/](design/factions/README.md)                            | Resources, structure roles, grid placement, adjacency bonuses, tech tiers; [AFN](design/factions/afn.md), [EC](design/factions/ec.md), [PI](design/factions/pi.md)         |
| [world-2035.md](design/factions/world-2035.md)                    | World, story, campaigns and signature roster (source of truth for names)                                                                                                   |
| [test-faction.md](design/factions/test-faction.md)                | The mirrored test faction for the first playable, with stats                                                                                                               |
| [combat-and-balance.md](design/combat-and-balance.md)             | Weapons, damage vs. armour, targeting, projectiles, wrecks, balancing process                                                                                              |
| [units-and-orders.md](design/units-and-orders.md)                 | Orders, queues and waypoints, stances, auto-behaviour, transports and garrisons                                                                                            |
| [economy.md](design/economy.md)                                   | Harvesting, spending and refunds, power, sharing, pacing targets                                                                                                           |
| [neutrals-and-map-objects.md](design/neutrals-and-map-objects.md) | Capturable tech structures, civilian buildings, bridges, crates                                                                                                            |
| [hotkeys.md](design/hotkeys.md)                                   | Default key bindings for both layouts                                                                                                                                      |
| [match-rules.md](design/match-rules.md)                           | Configurable match settings, caps, game speed, repair, veterancy                                                                                                           |
| [modes.md](design/modes.md)                                       | Skirmish, multiplayer, campaign (later), map editor playtest                                                                                                               |
| [multiplayer.md](design/multiplayer.md)                           | Seats, Forces, grants, lobby presets, co-op presence, chat and voice, Last Stand, diplomacy, protocol                                                                      |
| [accounts-and-progression.md](design/accounts-and-progression.md) | Guest and account identity, friends, ranked play, stats, achievements                                                                                                      |
| [community-and-safety.md](design/community-and-safety.md)         | Chat and voice safety, reporting, moderation, fair play, privacy                                                                                                           |
| [objectives-and-victory.md](design/objectives-and-victory.md)     | Defeat rules, victory conditions, conquest, objectives and missions                                                                                                        |
| [fog-of-war.md](design/fog-of-war.md)                             | Vision rules, fog memory, stealth, shared vision, enforcement                                                                                                              |
| [terrain-and-biomes.md](design/terrain-and-biomes.md)             | Grid, height levels, water, trees, props, biomes, weather                                                                                                                  |
| [content-and-eras.md](design/content-and-eras.md)                 | Game profiles, rulesets, packs, resources, territory, eras and per-era variants, unit and structure families                                                               |
| [onboarding.md](design/onboarding.md)                             | First launch, Basic Training, hints, Field Manual                                                                                                                          |
| [art-and-audio.md](design/art-and-audio.md)                       | Blocky toy-brick art direction, graphics presets, audio                                                                                                                    |
| [screens/](design/screens/README.md)                              | Every screen with a wireframe: home, campaign, skirmish setup, room browser, lobby, loading, match HUD, in-game menu, post-match, settings, load game, replays, map editor |

### Engineering: how it's built

| Doc                                                                      | Covers                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [architecture.md](engineering/architecture.md)                           | Stack, build vs. use, apps and packages, determinism contract, ECS, nav and physics, server, performance |
| [numerics.md](engineering/numerics.md)                                   | Integer-only sim math: units, rounding, trig tables, PRNG, hashing, content unit conversion              |
| [rendering.md](engineering/rendering.md)                                 | Interpolation, instancing, culling and LOD, construction and destruction animations, health bars         |
| [pathfinding.md](engineering/pathfinding.md)                             | Nav grids, A* and hierarchical paths, budgets, formations, avoidance, air movement                       |
| [ai.md](engineering/ai.md)                                               | Bot rules, layered decisions, roles, debugging, first bot                                                |
| [map-editor.md](engineering/map-editor.md)                               | Map formats, nav domains, editor milestones, validation, playtest loop                                   |
| [content-pipeline.md](engineering/content-pipeline.md)                   | Definition metadata, schemas, content and asset validation, staleness checks                             |
| [modding.md](engineering/modding.md)                                     | Mod packs, overrides, loading, multiplayer sync, sharing                                                 |
| [localization.md](engineering/localization.md)                           | Locale files, ICU messages, fallback, pseudo-localization, translations                                  |
| [deployment-and-operations.md](engineering/deployment-and-operations.md) | Environments, hosting, versions, CI/CD, telemetry, monitoring                                            |
| [saves-and-replays.md](engineering/saves-and-replays.md)                 | Snapshots, command logs, replays, save and resume, version compatibility                                 |
| [testing.md](engineering/testing.md)                                     | Test layers, determinism harness, invariants, CI                                                         |

### Contributing: how to add to it

| Doc                                                           | Covers                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [adding-content.md](contributing/adding-content.md)           | Adding units, structures, weapons, techs, factions; previews               |
| [conventions.md](contributing/conventions.md)                 | Naming for files, IDs, assets, code, tests, commits; coding rules          |
| [content-format.md](contributing/content-format.md)           | Packs, profiles, presets, IDs, units of measure, a template for every file |
| [review-checklists.md](contributing/review-checklists.md)     | What reviewers check on code, content and docs PRs                         |
| [authoring-scenarios.md](contributing/authoring-scenarios.md) | Campaigns, missions, objectives and triggers, skirmish presets             |
| [assets.md](contributing/assets.md)                           | Where assets live, Git LFS, authorship, formats and budgets                |

### Planning

| Doc                      | Covers                                        |
| ------------------------ | --------------------------------------------- |
| [roadmap.md](roadmap.md) | Phases, first milestone, first-playable scope |

New docs go in the folder that matches their audience. Add a subfolder once a topic has at least two docs.

## Decided so far

- **Game first, engine second.** Build a fun game, then make its engine reusable.
- **Scale:** classic base-building 3D RTS; 60 fps with 300 units on screen, 30+ fps with 1,000 units in a match.
- **Determinism from day one:** fixed 20 Hz integer tick, fixed-point gameplay math, seeded PRNG streams, canonical command order, state hashes.
- **Online model:** server-authoritative simulation with visibility-filtered snapshots and deltas. No client lockstep requirement.
- **Multiplayer sessions:** Colyseus for rooms, lobby, matchmaking and reconnect; match state over our own protocol.
- **Build vs. use:** we use Bun, Turborepo, Biome, Babylon.js, React and Colyseus. We write the ECS, physics, pathfinding, fog, AI, protocol and content tooling.
- **Apps:** `web` and `server` are separate apps; a Tauri 2 `desktop` shell and a `mobile` shell come later.
- **Modes:** skirmish (single player and multiplayer) first; campaign later. The map editor's playtest doubles as the content preview.
- **Configurable matches:** caps, speed, economy, combat and victory rules are settings with defaults, overridable per match.
- **Factions:** AFN, EC and PI with infantry, vehicles, aircraft and naval units; grid-placed structures with adjacency bonuses; one era now, era-aware definitions.
- **Assets live in this repo**, stored with Git LFS, all original, every file with metadata and validated.
- **First playable:** one mirrored generic test faction, then one official faction for the vertical slice.
- **Art:** blocky, toy-brick low-poly.
- **License:** MIT for everything in the repo, code and assets.

## Open questions

- **UI state:** React + Zustand was proposed. Confirm when the first UI lands.
- **Final name:** `open-neo-rts` is the working name; "OpenRTS" is already taken by several projects.
- **Missing planning-kit files:** the original kit also had `PRD.md`, `EXTENSIONS.md`, a 50-task `ROADMAP.md`, research notes and example JSON contracts. The world document is now in [factions/world-2035.md](design/factions/world-2035.md).
