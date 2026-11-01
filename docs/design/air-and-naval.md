# Air and naval combat

How aircraft and ships work, how they interact with ground forces, fog and structures. Unit rosters are in the faction docs; movement internals are in [pathfinding.md](../engineering/pathfinding.md#air-movement).

**Phase:** air units in phase 3 (vertical slice faction); naval units in phase 4.

## Air

**Kinds of aircraft**

| Kind                                | Moves                                                        | Typical role                                                                |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Drones**                          | Low altitude, hover and strafe, small and cheap              | Scouting, swarming, harvesting (the Alliance of Free Nations' Supply Drone) |
| **Rotorcraft** (helicopters, VTOLs) | Hover anywhere, turn in place, land anywhere flat            | Gunships, transports, scouts                                                |
| **Fixed-wing** (jets, bombers)      | Minimum speed and a turning circle; can't hover; attack runs | Strikes, bombing, air superiority                                           |

**Altitude and targeting**

- Aircraft fly in an altitude band above the terrain. The `air` target domain is separate from `ground`: a tank's cannon can't hit aircraft, and anti-air can't hit tanks (or only weakly). How much a weapon deals to aircraft is its warheads' `versus` for the `aircraft` armour class ([combat-and-balance.md](combat-and-balance.md#damage-against-armour)).
- **Air-to-air:** fighters carry weapons that target `air`. Gunships target `ground` and some `air`. Bombers target `ground` and `structure` only.
- Drones fly low enough that small arms can hit them: any weapon that lists `air` in its `targets` and has a non-zero `versus` for `aircraft` can.

**Ammunition and rearming**

- Fixed-wing aircraft carry limited ammunition (a number of attack runs). When empty they return to their **airfield pads** to rearm, automatically, then resume their orders.
- Each airfield has a fixed number of pads; **one pad per fixed-wing aircraft**, which also caps how many a Force can field without more airfields.
- Rotorcraft and drones have unlimited ammunition but slower weapons.

**Vision and fog**

- Aircraft see further and **aren't blocked by cliffs or tall structures**, which makes them strong scouts.
- They're visible to anyone whose vision covers their position. Stealth aircraft need detection.

**Landing, crashing and transports**

- Rotorcraft can land, to stop being a target for anti-air beyond a short range and to save attention. Fixed-wing aircraft only land on pads.
- A destroyed aircraft crashes forward and leaves a small wreck where it falls. Debris can damage units under it lightly.
- **Air transports** pick up and drop at points, with no landing zone needed for rotorcraft. Cargo dies with the transport ([units-and-orders.md](units-and-orders.md#transports-and-garrisons)).

## Naval

**Water and movement**

- The [accepted movement-domain table](../project/decisions/2026-11-01-movement-water-table.md) applies: naval uses deep water only; hover and amphibious use land and both water depths; foot uses land and shallow; wheeled uses land and shallow with 50% speed there; tracked uses land only. Air crosses all three directly, without a grid. There is no separate light-boat shallow-water exception.
- Naval structures sit on the coast with mixed footprint cells ([structures.md](structures.md#placement)). A map without enough deep water and coastline disables naval production; the lobby shows "naval: no" on such maps.

**Ship classes**

| Class               | Role                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Patrol boat         | Fast, cheap, anti-infantry and anti-boat, light transport                                 |
| Frigate / destroyer | All-round: anti-ship, anti-air, depth charges                                             |
| Heavy ship          | Long-range shore bombardment; weak up close and against submarines                        |
| Submarine           | Stealthed while submerged; torpedoes vs ships; detected by sonar abilities and destroyers |
| Landing craft       | Amphibious transport: carries vehicles and infantry onto beaches                          |

**Interaction with land and air**

- **Shore bombardment:** long-range ships hit ground targets near the coast, so naval control matters on coastal maps.
- **Amphibious landings:** landing craft unload onto any shallow-water or beach cell. Unloading takes a few seconds, during which they're vulnerable.
- Ships are targeted by weapons with the `naval` target domain; most ground units can't hit them, but anti-ship missiles and artillery can.
- Ships see like ground units, without the air bonus.

**Destruction**

Sunk ships leave no salvageable wreck by default (they sink). A ruleset can turn on shallow-water wrecks for salvage.

## Non-happy paths

- **All pads destroyed:** fixed-wing aircraft circle over the last pad's location, then over the headquarters, waiting for a new airfield; they can still fight with remaining ammunition.
- **Transport destroyed over water:** infantry and vehicles in it are lost; hover and amphibious cargo is ejected.
- **Naval rally point on land:** ships go to the nearest deep-water cell.
