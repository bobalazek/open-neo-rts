# Game design

## The world of 2038

Three asymmetric factions: the Alliance of Free Nations, the Eastern Collective and the Phoenix Initiative ([story.md](story.md)). Each faction's look, economy, structures, tech tree, units and powers are in [factions/](factions/README.md).

| Faction                                                          | Identity                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Alliance of Free Nations](factions/alliance-of-free-nations.md) | Technology and precision: drones, stealth, shields, precision strikes, air power |
| [Eastern Collective](factions/eastern-collective.md)             | Industrial superiority: mass production, heavy armour, EMP                       |
| [Phoenix Initiative](factions/phoenix-initiative.md)             | Salvage and adaptation: mobile base, salvage, nanites, the Black Market          |

## Battlefield salvage

Destroyed vehicles leave wrecks (brick piles) that can be collected, repaired or converted into resources. The Phoenix Initiative specialises in this. The other factions get their own ways to control or deny wreckage, so battles are about more than producing tanks until somebody loses.

## Units

- **Domains:** infantry, vehicles, aircraft and naval. Unit families and components are listed in [content-and-eras.md](content-and-eras.md#5-unit-families-and-composable-prefabs).
- **Projectiles:** weapons fire actual projectiles (instant, bullet, arc, grenade, missile, beam, dropped; see [combat-and-balance.md](combat-and-balance.md#projectile-how-the-shot-travels)). Handled by our own deterministic physics; see [architecture.md](../engineering/architecture.md#7-movement-navigation-and-physics).
- **Abilities:** faction and unit special abilities (stealth, EMP, precision strikes, field modifications).

## Structures

Headquarters, power, drop-off, production for each domain, research, support, defences, walls and one superweapon per Force. Builders construct them on site, snapped to the map grid. Roles, construction, placement and nearby-structure bonuses are in [structures.md](structures.md); each faction's structures are in [factions/](factions/README.md). With optional rule modules, there are also cities, forts and wonders.

## Progression

- Research and upgrades through a **skill/tech tree** per faction.
- Optional **era advancement**, which unlocks new technologies, resource types, buildings and unit generations.

## Game modes

Skirmish (single player and multiplayer) now, campaign later, and the map editor, whose playtest reuses [debug mode](screens/debug-mode.md). See [modes.md](modes.md). Nearly every rule (caps, speed, resources, victory) is configurable per match; see [match-rules.md](match-rules.md).

## Teams, control and diplomacy

Shared Command, Allied Command, Last Stand, lobby templates, permission grants, diplomacy and victory rules are specified in [multiplayer.md](multiplayer.md).

## Optional rule modules and eras

Rise of Nations-style mechanics (territory, cities, supply and attrition, trade, wonders, territory victory), and era progression are specified in [content-and-eras.md](content-and-eras.md). They are rule modules a match switches on in the lobby, never forced into every game.

## Maps and editor

See [map-editor.md](../engineering/map-editor.md).

## AI opponents and allies

See [ai.md](../engineering/ai.md).

## More detail

| Topic                                                   | Doc                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| Factions, structures, tech trees, units                 | [factions/](factions/README.md)                             |
| Weapons, armour, targeting, projectiles, balancing      | [combat-and-balance.md](combat-and-balance.md)              |
| Orders, stances, transports, garrisons                  | [units-and-orders.md](units-and-orders.md)                  |
| Harvesting, power, spending, pacing                     | [economy.md](economy.md)                                    |
| Neutral tech structures, bridges, crates                | [neutrals-and-map-objects.md](neutrals-and-map-objects.md)  |
| Match settings, caps, game speed, repair, veterancy     | [match-rules.md](match-rules.md)                            |
| 3D map, height levels, trees, water, biomes             | [terrain-and-biomes.md](terrain-and-biomes.md)              |
| Fog of war, stealth, shared vision                      | [fog-of-war.md](fog-of-war.md)                              |
| Game modes, defeat, victory, objectives and missions    | [objectives-and-victory.md](objectives-and-victory.md)      |
| Every screen: menus, lobby, HUD, in-game menu, settings | [screens/](screens/README.md)                               |
| Tutorial, hints, Field Manual                           | [onboarding.md](onboarding.md)                              |
| Art direction, graphics presets, audio                  | [art-and-audio.md](art-and-audio.md)                        |
| Saves, replays, campaign progress                       | [saves-and-replays.md](../engineering/saves-and-replays.md) |
