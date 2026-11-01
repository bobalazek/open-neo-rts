# open-neo-rts docs

Start with [design/vision.md](design/vision.md) and [design/story.md](design/story.md). Contributors: [CONTRIBUTING.md](../CONTRIBUTING.md), [conventions.md](contributing/conventions.md) and [pull-requests.md](contributing/pull-requests.md). What to build now: [project/roadmap.md](project/roadmap.md) and [project/tasks.md](project/tasks.md).

### Project: where we are

| Doc                                       | Covers                                                  |
| ----------------------------------------- | ------------------------------------------------------- |
| [project/](project/README.md)             | How project tracking works                              |
| [roadmap.md](project/roadmap.md)          | Phases, exit criteria, and which docs each phase builds |
| [tasks.md](project/tasks.md)              | Work that can start now, by phase                       |
| [human-tasks.md](project/human-tasks.md)  | Decisions and actions waiting on a person               |
| [decisions/](project/decisions/README.md) | Why things are the way they are                         |
| [learnings/](project/learnings/README.md) | Surprises worth remembering                             |

### Design: what the game is

| Doc                                                               | Covers                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [vision.md](design/vision.md)                                     | What we're building, feel, what makes it distinct, licensing                                                                                                                                                                                             |
| [story.md](design/story.md)                                       | The world after 2032, the war's phases, campaigns, timeline                                                                                                                                                                                              |
| [game-design.md](design/game-design.md)                           | Overview and entry point                                                                                                                                                                                                                                 |
| [factions/](design/factions/README.md)                            | Shared roles, resources, builders, tech tiers, powers; [Alliance of Free Nations](design/factions/alliance-of-free-nations.md), [Eastern Collective](design/factions/eastern-collective.md), [Phoenix Initiative](design/factions/phoenix-initiative.md) |
| [structures.md](design/structures.md)                             | Construction by builders, placement (land, water, shore), info panel, rally points, power, upgrades, defences, superweapons, wonders                                                                                                                     |
| [units-and-orders.md](design/units-and-orders.md)                 | Orders, queues and waypoints, stances, auto-behaviour, transports and garrisons                                                                                                                                                                          |
| [combat-and-balance.md](design/combat-and-balance.md)             | Weapons, projectiles, warheads, damage against armour, modifiers, targeting, balance                                                                                                                                                                     |
| [air-and-naval.md](design/air-and-naval.md)                       | Aircraft, rearming, air-to-air, ships, coastal structures, amphibious landings                                                                                                                                                                           |
| [economy.md](design/economy.md)                                   | Harvesting, spending, queues, power, transfers, convoys, markets                                                                                                                                                                                         |
| [objectives-and-victory.md](design/objectives-and-victory.md)     | Game modes (Last Man Standing, Wonder Race, …), wonders, defeat rules, missions                                                                                                                                                                          |
| [match-rules.md](design/match-rules.md)                           | Configurable settings, caps, game speed, leaving and disconnecting                                                                                                                                                                                       |
| [modes.md](design/modes.md)                                       | Skirmish, multiplayer, campaign, map editor playtest                                                                                                                                                                                                     |
| [multiplayer.md](design/multiplayer.md)                           | Seats, Forces, grants, lobby templates, co-op presence, chat and voice, diplomacy, protocol                                                                                                                                                              |
| [fog-of-war.md](design/fog-of-war.md)                             | Vision rules, fog memory, stealth, shared vision, enforcement                                                                                                                                                                                            |
| [terrain-and-biomes.md](design/terrain-and-biomes.md)             | Grid, height levels, water, trees, props, biomes, weather                                                                                                                                                                                                |
| [neutrals-and-map-objects.md](design/neutrals-and-map-objects.md) | Capturable tech structures, civilian buildings, bridges, crates                                                                                                                                                                                          |
| [content-and-eras.md](design/content-and-eras.md)                 | Territory, cities, trade routes, eras (later)                                                                                                                                                                                                            |
| [accounts-and-progression.md](design/accounts-and-progression.md) | Guest and account identity, friends, ranked play, stats                                                                                                                                                                                                  |
| [community-and-safety.md](design/community-and-safety.md)         | Chat and voice safety, reporting, moderation, fair play, privacy                                                                                                                                                                                         |
| [onboarding.md](design/onboarding.md)                             | First launch, Basic Training, hints, Field Manual                                                                                                                                                                                                        |
| [art-and-audio.md](design/art-and-audio.md)                       | Blocky toy-brick art direction, graphics presets, audio                                                                                                                                                                                                  |
| [audio-events.md](design/audio-events.md)                         | Every sound: unit voices, announcer lines, effects, music                                                                                                                                                                                                |
| [ui-style.md](design/ui-style.md)                                 | HUD zones, icon style and states, build panel pages, selection feedback                                                                                                                                                                                  |
| [hotkeys.md](design/hotkeys.md)                                   | Default key bindings and browser-reserved keys                                                                                                                                                                                                           |
| [screens/](design/screens/README.md)                              | Every screen with a wireframe, including the minimap and the content editor                                                                                                                                                                              |

### Engineering: how it's built

| Doc                                                                      | Covers                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [architecture.md](engineering/architecture.md)                           | Stack, build vs. use, apps and packages, determinism contract, ECS, nav and physics, server, performance |
| [numerics.md](engineering/numerics.md)                                   | Integer-only sim math: units, rounding, trig tables, PRNG, hashing, content unit conversion              |
| [rendering.md](engineering/rendering.md)                                 | Interpolation, instancing, culling and LOD, construction and destruction, health bars                    |
| [pathfinding.md](engineering/pathfinding.md)                             | Nav grids, A* and hierarchical paths, budgets, formations, avoidance, air movement                       |
| [ai.md](engineering/ai.md)                                               | Bot rules, layered decisions, roles, debugging, first bot                                                |
| [map-editor.md](engineering/map-editor.md)                               | Map formats, editor milestones, validation, playtest loop                                                |
| [content-pipeline.md](engineering/content-pipeline.md)                   | Schemas, content and asset validation, staleness checks                                                  |
| [modding.md](engineering/modding.md)                                     | Mod packs, overrides, loading, multiplayer sync, sharing                                                 |
| [localization.md](engineering/localization.md)                           | Where strings live, translations, fallback                                                               |
| [saves-and-replays.md](engineering/saves-and-replays.md)                 | Snapshots, command logs, replays, save and resume, versions                                              |
| [deployment-and-operations.md](engineering/deployment-and-operations.md) | Environments, hosting, versions, CI/CD, telemetry, monitoring                                            |
| [testing.md](engineering/testing.md)                                     | Test layers, determinism harness, invariants, CI                                                         |

### Contributing: how to add to it

| Doc                                                           | Covers                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [conventions.md](contributing/conventions.md)                 | Naming for files, IDs, assets, code, tests, commits; coding rules                                                        |
| [pull-requests.md](contributing/pull-requests.md)             | PR types (engine, unit, structure, faction, balance, map, art, translation, pack, tooling, docs), what each must include |
| [review-checklists.md](contributing/review-checklists.md)     | What reviewers check on code, content and docs PRs                                                                       |
| [content-format.md](contributing/content-format.md)           | Content layout, IDs, units of measure, every definition field                                                            |
| [adding-content.md](contributing/adding-content.md)           | Adding a unit, structure, faction, map or translation step by step                                                       |
| [assets.md](contributing/assets.md)                           | Where assets live, Git LFS, authorship, formats, model conventions                                                       |
| [authoring-scenarios.md](contributing/authoring-scenarios.md) | Campaigns, missions, objectives and triggers, skirmish maps                                                              |

## Glossary

| Term                | Meaning                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Force**           | The owner of units, structures, resources and tech in a match. One or more seats control it                                  |
| **Seat**            | A place in a match for one human or bot. Seats get grants on a Force                                                         |
| **Grant**           | Permission for a seat to do certain things with a Force (army orders, economy, research…)                                    |
| **Team**            | Forces that win or lose together                                                                                             |
| **Faction**         | Alliance of Free Nations, Eastern Collective or Phoenix Initiative. Several Forces can pick the same faction                 |
| **Role**            | What the engine treats a unit or structure as, whatever the faction calls it: builder, harvester, headquarters, superweapon… |
| **Builder**         | The unit role that constructs, repairs and captures structures and works on wonders                                          |
| **Shared Command**  | Several seats controlling one Force: one army, one economy                                                                   |
| **Allied Command**  | Several Forces on one team, each with its own army and economy                                                               |
| **Last Stand**      | The post-defeat rule that lets an eliminated player help a surviving ally's Force                                            |
| **Wonder**          | The Quantum Nexus: completing it first wins the Wonder Race mode                                                             |
| **Vision group**    | Everyone who sees the same fog view: a Force, its co-controllers, and whoever shares vision                                  |
| **System seat**     | A reserved seat for server-issued commands (takeover, pause, kick), so replays reproduce them                                |
| **Pack**            | A self-contained folder of content (`core`, mods), with a manifest listing every file                                        |
| **Map**             | Terrain plus spawns, player count, resource fields and pre-placed objects                                                    |
| **Spawn**           | A start position on a map; each Force gets one                                                                               |
| **Lobby template**  | A built-in lobby shortcut (1v1, 2v2, Shared Command, Survival) that fills seats from the map's spawns                        |
| **Movement domain** | How something moves: foot, wheeled, tracked, hover, amphibious, naval, air                                                   |
| **Tick**            | One simulation step: 1/20 of a game second                                                                                   |
| **Subcell**         | The sim's distance unit: 1/1,024 of a map cell                                                                               |
