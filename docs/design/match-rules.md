# Match rules and settings

Almost everything about a match is configurable. Rules are data with defaults, and a host can override them per match: in single-player skirmish, in multiplayer lobbies, and in presets.

## Configuration layers

Each layer overrides the one before it:

```text
Engine hard limits         safety ceilings, never exceeded (below)
  → Setting defaults       defined in code; packs may override defaults and ranges (rules/settings.json)
    → Map                  player count, spawns, start mode
      → Lobby choices      the host's settings, within the allowed ranges
        → Per-Force        handicaps and per-Force limits
```

- The resolved settings are part of the match setup. They're shown in the lobby summary, included in the content hash handshake, saved in saves and replays, and deterministic like everything else.
- Hosts can save any combination as a **saved setup** (stored on their device) and share it as a link.
- **Ranked play** locks the settings that matter for fairness.
- The lobby shows common settings up front; everything else is in an **Advanced rules** panel ([lobby.md](screens/lobby.md)).

## Settings

| Group              | Setting                                                                            | Default (standard)                      | Scope                                                          |
| ------------------ | ---------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| **Caps**           | Population cap                                                                     | 200 per Force (150 with 5+ Forces)      | Match, per faction, per Force                                  |
|                    | Population cost per unit                                                           | From content                            | Per unit (content)                                             |
|                    | Structure cap                                                                      | 150 (walls count ¼)                     | Match, per faction, per Force                                  |
|                    | Per-type limits                                                                    | 1 strategic structure; unlimited others | Per unit or structure type                                     |
|                    | Max tech tier                                                                      | 4                                       | Match                                                          |
|                    | Banned units and structures                                                        | None                                    | List                                                           |
| **Economy**        | Starting resources                                                                 | Standard                                | Match, per Force                                               |
|                    | Income multiplier                                                                  | 100%                                    | Match, per Force (handicap)                                    |
|                    | Resource node richness                                                             | Normal                                  | Match                                                          |
|                    | Team resource sharing                                                              | Transfers allowed                       | Match                                                          |
|                    | Upkeep                                                                             | Off                                     | Match                                                          |
| **Speed**          | Game speed                                                                         | Normal                                  | Match (single player: live)                                    |
|                    | Build and research speed                                                           | 100%                                    | Match                                                          |
|                    | Peace timer (no attacks)                                                           | Off                                     | Match                                                          |
|                    | Time limit                                                                         | None                                    | Match                                                          |
| **Combat**         | Friendly fire                                                                      | Splash only                             | Match                                                          |
|                    | Veterancy                                                                          | On                                      | Match                                                          |
|                    | Commander powers                                                                   | On                                      | Match                                                          |
|                    | Strategic structures                                                               | On                                      | Match                                                          |
|                    | Wreck decay                                                                        | After 500 wrecks                        | Match                                                          |
| **Map and vision** | Fog                                                                                | Standard                                | Match                                                          |
|                    | Starting positions                                                                 | Fixed                                   | Match                                                          |
| **Victory**        | Conditions and parameters                                                          | Conquest                                | Match ([objectives-and-victory.md](objectives-and-victory.md)) |
|                    | Elimination rule                                                                   | Annihilation                            | Match                                                          |
| **Teams**          | Diplomacy mode, post-defeat policy, Shared Command grants, leave/disconnect policy | Lobby                                   | Match ([multiplayer.md](multiplayer.md))                       |
| **Bots**           | Difficulty, personality, handicap                                                  | Normal                                  | Per bot                                                        |
| **Rule modules**   | Territory, supply, trade, wonders, eras                                            | Per profile                             | Match ([content-and-eras.md](content-and-eras.md))             |

Settings are defined once in code (`packages/content/src/rules/settings.ts`), each with a type, default, range and description. New settings don't need lobby UI work: the Advanced rules panel is generated from that list.

## Leaving and disconnecting

One setting decides what happens to a seat whose player leaves or drops, so every doc and screen follows the same rule.

| Event                                           | Default (custom and unranked)                                                                        | Ranked                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Disconnect                                      | Seat waits for the **reconnect window** (90 s); the Force keeps running, co-controllers keep playing | Same                                  |
| Reconnect window expires, co-controllers remain | Seat is removed; co-controllers keep the Force                                                       | Same                                  |
| Reconnect window expires, no co-controllers     | **Bot takeover** at Normal difficulty                                                                | Force is eliminated; the player loses |
| Player chooses Leave                            | Same as an expired window, immediately                                                               | Counts as a loss                      |
| Stuck loading > 60 s                            | Same as a disconnect                                                                                 | Same                                  |

Options: reconnect window (30–300 s), takeover (bot / eliminate / pause the match for a vote), bot difficulty. Takeover and handback are system-seat commands, so replays show them.

## Engine hard limits

Safety ceilings that keep simulation, snapshots and rendering inside their budgets:
- 8 Forces and 16 seats;
- 8,192 simulated entities in total (units, structures, projectiles, wrecks);
- population cap up to 500 per Force.

Settings can go up to these limits, never past them. Combinations that exceed the tested performance envelope (more than 1,000 mobile units possible) show a warning in Advanced rules.

## Game speed

The sim always runs 20 ticks per _game_ second. Game speed changes how many ticks run per _real_ second:

| Speed  | Ticks per real second |
| ------ | --------------------- |
| Slow   | 15 (0.75×)            |
| Normal | 20 (1×)               |
| Fast   | 30 (1.5×)             |
| Faster | 40 (2×)               |

- **Single player:** change speed any time from the HUD or with hotkeys (+ / −), and pause with the in-game menu.
- **Multiplayer:** the speed is set in the lobby and fixed for the match. Pausing follows [in-game-menu.md](screens/in-game-menu.md).
- **Editor playtest:** pause, step one tick, and up to 8×.
- **Replays:** 0.5× to 8×, with seeking.
- Timers, cooldowns and the match clock always show game time.

## Population and Shared Command

Every unit has a population cost (infantry 1, light vehicles 2, tanks and aircraft 3, heavy units and warships 4–6, harvesters 0). While at the cap, production pauses with a "population limit" notice. The cap belongs to the **Force**, not to each player, so adding controllers never multiplies the army. Territory rulesets can raise the cap through cities.

## Unit life

- **Health and armour** come from content data; damage follows [combat-and-balance.md](combat-and-balance.md).
- **Repair:** vehicles repair near repair units and drones, or at captured machine shops. Structures are repaired by their owner for credits over time. Infantry heal slowly in garrisons and near captured field hospitals ([neutrals-and-map-objects.md](neutrals-and-map-objects.md)).
- **Veterancy** (if enabled): units gain XP from the cost value of damage they deal. There are three ranks; each gives +10% damage and health, and the top rank adds slow self-repair. Ranks show as chevrons.
