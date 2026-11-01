# Audio events

Every sound the game plays, when it plays, and how it's kept from turning into noise. Direction and mixing are in [art-and-audio.md](art-and-audio.md#audio); file naming is in [conventions.md](../contributing/conventions.md).

**Phase:** weapons, impacts, UI and core announcer lines in phase 2; unit voices in phase 3; music system in phase 2 (random playlist).

## How sounds are triggered

- The sim emits **events** (unit produced, weapon fired, structure destroyed, attack on a unit…). The client maps events to sounds in the presentation layer; the sim never plays audio.
- A unit or structure definition names its sounds in `presentation.sounds` (`fire`, `move`, `select`, `death`…). Files follow `<name>.<event>.ogg`, with variations `<name>.<event>.<n>.ogg` picked at random.
- Clients only receive events their seat is allowed to see, so fog applies to sound automatically: you never hear a hidden enemy.

## Unit voices

| Event        | When                        | Notes                                            |
| ------------ | --------------------------- | ------------------------------------------------ |
| `select`     | Unit or group selected      | One line per selection, from the first unit type |
| `move`       | Move order acknowledged     | Plays after the server acknowledges the order    |
| `attack`     | Attack or attack-move order |                                                  |
| `ability`    | Ability used                | Per ability, optional                            |
| `under_fire` | First hit after being idle  | Throttled per unit                               |
| `produced`   | Unit leaves the factory     | "Ready for orders" style line                    |

Spam control: at most one voice line every 0.8 s per player. Repeated clicks on the same group cycle through variations and then go quiet.

## Announcer

The announcer speaks for the player's Force. Every line also appears in the HUD's event feed with a click-to-jump location, and as a subtitle.

| Line                        | Priority | Cooldown | Trigger                                                             |
| --------------------------- | -------- | -------- | ------------------------------------------------------------------- |
| Base under attack           | High     | 20 s     | A structure of yours is hit while no attack alert was active        |
| Unit under attack           | Medium   | 20 s     | A unit outside your base is hit (not for every unit: once per area) |
| Control group under attack  | Medium   | 15 s     | A unit of a numbered control group is hit ("Group 2 under attack")  |
| Ally under attack           | Medium   | 30 s     | A teammate's base is hit                                            |
| Harvester under attack      | High     | 20 s     | A harvester is hit                                                  |
| Unit lost                   | Low      | 10 s     | One of your units dies (aggregated in big battles)                  |
| Structure lost              | High     | 5 s      | One of your structures is destroyed                                 |
| Construction complete       | Medium   | none     | A structure is ready to place                                       |
| Unit ready                  | Low      | 3 s      | A unit is produced (aggregated)                                     |
| Research complete           | Medium   | none     | An upgrade or tech finishes                                         |
| Insufficient funds          | Medium   | 10 s     | A queue stalls for money                                            |
| Low power                   | High     | 30 s     | Brownout starts                                                     |
| Population limit            | Medium   | 30 s     | Production stalls at the cap                                        |
| Structure captured          | High     | none     | One of your structures is captured                                  |
| Superweapon detected        | High     | none     | An enemy superweapon is built                                       |
| Superweapon ready           | High     | none     | Yours is charged                                                    |
| Superweapon launch detected | Critical | none     | A superweapon targets an area you can see                           |
| Objective updated           | Medium   | none     | Mission objectives change                                           |
| Teammate joined / left      | Medium   | none     | Seat changes in multiplayer                                         |

**Priority rules:** a higher-priority line interrupts a lower one; same priority waits in a short queue (max 2), and anything older than 3 s is dropped. Critical lines always play.

## Effects

| Group        | Examples                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| Weapons      | Per weapon: fire, plus a distant variant beyond a range                               |
| Impacts      | Per damage type and surface: bullet on metal, explosion on ground, brick-shatter      |
| Movement     | Engine loops for vehicles and aircraft, footsteps for squads (quiet), water for ships |
| Construction | Brick-snap clicks while a structure assembles, a finishing chime                      |
| Destruction  | Brick collapse, explosion, wreck settle                                               |
| UI           | Click, hover, error, build-panel ready, chat message, ping                            |

**Spatial rules:** positional audio relative to the camera, distance falloff and culling, at most N simultaneous instances per sound (e.g. 6 identical rifle shots), lowest-priority instances dropped first.

## Music

- For now: a **random playlist** of in-game tracks, with menu music in menus.
- Later: calm and battle layers that crossfade on combat intensity, and a short victory or defeat sting.
- Volume per bus in [settings](screens/settings.md); music ducks slightly under announcer lines.

## Formats and loudness

- `.ogg` (Vorbis or Opus) is the primary format. Safari supports Ogg from 18.4, so the minimum Safari version is 18.4; an AAC (`.m4a`) fallback is generated at build time if older Safari support is ever needed.
- Loudness is normalised per category and checked by `bun neo validate-assets` (planned): the full mix around −24 LUFS integrated, true peak at most −1 dBTP; short effects are judged by peak and short-term loudness.
