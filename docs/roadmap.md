# Roadmap

Split planning from experimentation, so we don't spend months designing things that turn out to be unfun. **Build only what the current phase lists.** The docs describe the whole game; this page says what's in scope now.

## Phases

| Phase                    | Deliverable                                                                                                        | Rough effort*          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 0. Research & design     | These docs, scaffold, tooling                                                                                      | done                   |
| 1. Technical prototype   | **1a:** deterministic headless sim. **1b:** renderer, camera, terrain, selection, movement, pathfinding            | 2–4 weeks              |
| 2. First playable        | Local skirmish with the test faction against a bot: base building, economy, combat, victory                        | 1–3 months             |
| 3. Vertical slice        | One official faction polished, plus the first **online** play: 1v1 and 2v2 Shared Command through the match server | 2–4 months             |
| 4. Expansion             | All three factions, naval and air, upgrades, map editor, campaign core and Basic Training                          | Several months         |
| 5. Multiplayer & release | Room browser, voice, diplomacy, accounts and ranked, Tauri desktop, release pipeline                               | Several months or more |

\*Very approximate elapsed time for one experienced developer working consistently, not commitments.

**Multiplayer timing:** determinism and the per-seat visibility projection exist from phase 1. Single player runs the sim in a Web Worker behind the same projection, so fog and protocol bugs show up offline in phase 2. Online play arrives in phase 3, deliberately small (1v1 and 2v2 Shared Command), to prove the server-authoritative design before the content grows. The full multiplayer feature set is phase 5.

## Exit criteria

| Phase  | Done when                                                                                                                                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1a** | `bun neo run` plays a scripted 2-Force scenario (movement on a flat grid) for 10,000 ticks. Checkpoint hashes are identical across two runs in one process, two processes, and Chromium, Firefox and WebKit. `packages/deterministic` has golden tests for every function. CI runs all of this on every PR           |
| **1b** | 200 units move and path on a 128×128 map with height levels at 60 fps (medium preset). Selection, box select, move and attack-move orders work. The renderer reads only the projection                                                                                                                               |
| **2**  | A human beats or loses to the first bot in a test-faction mirror on the first map, by conquest, in 10–25 minutes. Every test-faction unit and structure is used. The replay reproduces the final hash. No crash in 20 AI-vs-AI matches across seeds. The content editor validates every shipped model and definition |
| **3**  | Two people finish a 1v1 online, and two people share one Force in a 2v2 against bots, with reconnect working. Fog-leak tests pass on every message type. One official faction plays a full match against the bot with all its units                                                                                  |
| **4**  | Three factions with win rates of 45–55% in AI-vs-AI runs. A map made in the editor plays online. Basic Training is completable                                                                                                                                                                                       |
| **5**  | Public release: browser and desktop builds, stable and beta channels, rollback tested                                                                                                                                                                                                                                |

## What each phase builds

Docs not listed for a phase are reference only for that phase.

| Area                                                                                                                                         | Phase   | Docs                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Determinism, numerics, ECS, command log, hashes, CLI                                                                                         | 1a      | [architecture.md](engineering/architecture.md), [numerics.md](engineering/numerics.md), [testing.md](engineering/testing.md)                                                                                                                                                                                                                                     |
| Renderer basics, camera, terrain, pathfinding, selection                                                                                     | 1b      | [rendering.md](engineering/rendering.md), [pathfinding.md](engineering/pathfinding.md), [terrain-and-biomes.md](design/terrain-and-biomes.md) (height levels, ramps, one biome)                                                                                                                                                                                  |
| Test faction, orders, economy, combat, fog, victory, first bot                                                                               | 2       | [test-faction.md](design/factions/test-faction.md), [units-and-orders.md](design/units-and-orders.md) (orders marked FP), [economy.md](design/economy.md), [combat-and-balance.md](design/combat-and-balance.md), [fog-of-war.md](design/fog-of-war.md), [objectives-and-victory.md](design/objectives-and-victory.md) (conquest), [ai.md](engineering/ai.md) §5 |
| Screens: home, skirmish setup, loading, match HUD, in-game menu, post-match, settings (graphics and audio)                                   | 2       | [screens/](design/screens/README.md)                                                                                                                                                                                                                                                                                                                             |
| Content editor (model viewer first), asset validation, playtest route (spawn + god tools, without the editor UI)                             | 2       | [content-editor.md](design/screens/content-editor.md), [content-pipeline.md](engineering/content-pipeline.md), [modes.md](design/modes.md)                                                                                                                                                                                                                       |
| Saves and replays (single player), hints, Field Manual                                                                                       | 2       | [saves-and-replays.md](engineering/saves-and-replays.md), [onboarding.md](design/onboarding.md)                                                                                                                                                                                                                                                                  |
| One official faction, match server, lobby, 1v1 and 2v2 Shared Command, reconnect                                                             | 3       | [factions/](design/factions/README.md), [multiplayer.md](design/multiplayer.md) §1–§4, §6–§8, [lobby.md](design/screens/lobby.md)                                                                                                                                                                                                                                |
| Other factions, air and naval, upgrades, neutrals, map editor, objectives and triggers, Basic Training, campaign core                        | 4       | [neutrals-and-map-objects.md](design/neutrals-and-map-objects.md), [map-editor.md](engineering/map-editor.md), [authoring-scenarios.md](contributing/authoring-scenarios.md)                                                                                                                                                                                     |
| Room browser, voice, presence polish, diplomacy, accounts, ranked, moderation, modding SDK, localization beyond English, desktop, deployment | 5       | [multiplayer.md](design/multiplayer.md) §5, §9–§10, [accounts-and-progression.md](design/accounts-and-progression.md), [community-and-safety.md](design/community-and-safety.md), [modding.md](engineering/modding.md), [localization.md](engineering/localization.md), [deployment-and-operations.md](engineering/deployment-and-operations.md)                 |
| Territory, cities, trade, eras, wonders, world-map campaign                                                                                  | after 5 | [content-and-eras.md](design/content-and-eras.md) §3–§4                                                                                                                                                                                                                                                                                                          |

## First milestone (1a): prove determinism before pixels

1. Monorepo, tooling, CI. _(done, except CI)_
2. `packages/deterministic`: PRNG streams, integer math helpers, trig tables, state hashing ([numerics.md](engineering/numerics.md)).
3. `packages/sim/src/ecs`: our ECS with stable IDs and versioned serialization.
4. `packages/sim`: tick loop, phase scheduler with hooks, command queue, snapshots, one trivial feature (movement on a flat grid).
5. `bun neo run` (in `apps/cli`): run a scenario from seed + command log and print checkpoint hashes.
6. Golden-hash test: the same scenario yields identical hashes twice in one process, across processes, and in a browser.

Only then: renderer, camera, selection, movement, combat, and the skirmish loop.

## Gate after phase 1

If controlling a group of tanks around a simple map already feels enjoyable, continue. If not, fix the feel before adding anything else.
