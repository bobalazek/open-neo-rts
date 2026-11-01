# EC: industrial superiority

Mass production, heavy armour and fortified bases. EC grinds opponents down with numbers and durability. Every unit is cheap for its toughness, but the army is slow and the base is power-hungry.

**Strengths:** cheap health per credit, production speed, heavy defences, EMP.
**Weaknesses:** slow units, high power demand, weak against stealth and long-range precision.

## Look

Dark steel-grey and **brick-red** bricks with **yellow-and-black hazard stripes**. Thick, boxy shapes, with smokestacks puffing brick-cube smoke, riveted plates (exposed studs) and big treads. Structures are large and blocky with chimneys and conveyor details.

## Economy twist: industry

**Foundries** convert credits into materials at a fixed rate, and speed up nearby factories. EC never depends on rare-metal nodes the way the others do, but it pays for it in power and space.

## Structures

Costs are credits / materials. Power is + produced or − used.

| Structure         | Tier | Cost        | Power | Role and production                                                               | Ability                                                         | Adjacency bonus                                       |
| ----------------- | ---- | ----------- | ----- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| Construction Yard | 1    | 3000 / 0    | +10   | HQ; builds all structures                                                         | Overtime: +50% production for 20 s, then a −25% cooldown period | —                                                     |
| Turbine Plant     | 1    | 800 / 0     | +100  | Power                                                                             | —                                                               | Each adjacent Turbine Plant: +10% output (max 3)      |
| Refinery          | 1    | 2000 / 0    | −30   | Ore → credits; comes with an armoured Hauler                                      | —                                                               | Next to an ore field: +20% unload speed               |
| Conscript Hall    | 1    | 400 / 0     | −10   | Infantry; trains 2 at a time                                                      | —                                                               | —                                                     |
| Bastion           | 1    | 900 / 0     | −20   | Heavy cannon bunker; can garrison 4 infantry                                      | —                                                               | Next to a Wall: +20% armour                           |
| Wall              | 1    | 50 / 0      | 0     | Blocks movement                                                                   | —                                                               | —                                                     |
| War Factory       | 1    | 2000 / 0    | −40   | Vehicles                                                                          | —                                                               | Within 4 cells of a Foundry: +15% build speed (max 2) |
| Command Bunker    | 2    | 1500 / 0    | −40   | Radar; unlocks support powers; T2                                                 | —                                                               | —                                                     |
| Foundry           | 2    | 1500 / 0    | −60   | Converts 100 credits into 20 materials every 10 s                                 | —                                                               | See War Factory and Shipyard                          |
| Airstrip          | 2    | 1500 / 200  | −30   | Aircraft; runway                                                                  | —                                                               | —                                                     |
| Shipyard          | 2    | 1500 / 200  | −30   | Naval units                                                                       | —                                                               | Within 4 cells of a Foundry: +15% build speed         |
| Flak Tower        | 2    | 900 / 50    | −30   | Anti-air                                                                          | —                                                               | —                                                     |
| EMP Coil          | 3    | 1800 / 300  | −80   | Disables vehicles and structures in a radius (pulse every 15 s)                   | —                                                               | —                                                     |
| Industrial Lab    | 3    | 2500 / 400  | −70   | Upgrades; unlocks T3                                                              | —                                                               | —                                                     |
| Thunder Battery   | 4    | 5000 / 1500 | −150  | Strategic: a 9-shell super-artillery barrage anywhere on the map (cooldown 6 min) | —                                                               | —                                                     |

## Tech tree

```text
Construction Yard
├── Turbine Plant
├── Refinery
├── Conscript Hall ── Conscript, Rocket Trooper, Engineer
├── Bastion, Wall
└── War Factory ── Hauler, Bulldog, Rhino
    └── Command Bunker (T2) ── Flak Truck, Hammer, Grenadier · powers: Carpet Bombing, Reinforcements
        ├── Foundry
        ├── Airstrip ── Hornet, Anvil
        ├── Shipyard ── Gunboat, Destroyer
        ├── Flak Tower
        └── Industrial Lab (T3) ── Pyro, Behemoth, EMP Crawler, Dreadnought · EMP Coil · upgrades
            └── Thunder Battery (T4)
```

Key research: Reinforced Plating (+20% vehicle health), Assembly Lines (−10% vehicle cost), Incendiary Shells (Hammer leaves fire), Hardened Circuits (own units resist EMP).

## Units

| Unit           | Domain   | Tier | Cost       | Role                                                     | Strong vs                | Weak vs               |
| -------------- | -------- | ---- | ---------- | -------------------------------------------------------- | ------------------------ | --------------------- |
| Conscript      | Infantry | 1    | 100 / 0    | Cheap rifle infantry                                     | Infantry                 | Vehicles, fire        |
| Rocket Trooper | Infantry | 1    | 300 / 0    | Anti-tank rockets                                        | Vehicles                 | Infantry              |
| Engineer       | Infantry | 1    | 500 / 0    | Capture, repair                                          | —                        | Everything            |
| Grenadier      | Infantry | 2    | 300 / 0    | Explosives; anti-structure                               | Structures, infantry     | Vehicles              |
| Pyro           | Infantry | 3    | 450 / 50   | Flamethrower; clears garrisons and forests               | Infantry                 | Vehicles              |
| Hauler         | Vehicle  | 1    | 1400 / 0   | Armoured harvester                                       | —                        | —                     |
| Bulldog        | Vehicle  | 1    | 700 / 0    | APC; carries 5 infantry; machine gun                     | Infantry                 | Tanks                 |
| Rhino          | Vehicle  | 1    | 900 / 100  | Heavy tank; cheap health                                 | Vehicles                 | Infantry AT, air      |
| Flak Truck     | Vehicle  | 2    | 800 / 50   | Anti-air                                                 | Air                      | Tanks                 |
| Hammer         | Vehicle  | 2    | 1400 / 150 | Howitzer artillery                                       | Structures, groups       | Fast units            |
| EMP Crawler    | Vehicle  | 3    | 1500 / 200 | Discharges EMP; disables vehicles                        | Vehicles (disable)       | Infantry              |
| Behemoth       | Vehicle  | 3    | 3000 / 500 | Super-heavy twin-cannon tank; crushes infantry and trees | Everything on the ground | Air, Lancers en masse |
| Hornet         | Air      | 2    | 1300 / 200 | Attack helicopter                                        | Vehicles                 | AA                    |
| Anvil          | Air      | 3    | 2400 / 500 | Heavy bomber; carpet bombs                               | Structures, groups       | AA                    |
| Gunboat        | Naval    | 2    | 800 / 100  | Cheap patrol; anti-infantry and anti-boat                | Boats, infantry          | Destroyers            |
| Destroyer      | Naval    | 2    | 1600 / 250 | All-round warship with depth charges                     | Submarines, ships        | Air                   |
| Dreadnought    | Naval    | 3    | 3200 / 600 | Battleship; long-range shore bombardment                 | Structures, ships        | Submarines, air       |

## Commander powers

- **Carpet Bombing:** a line of bombs across a target area.
- **Reinforcements:** drops 6 Conscripts and 2 Rhinos at a friendly structure.
- **EMP Barrage:** disables vehicles in an area for 10 s.
- **Thunder Battery** (strategic structure).

## AI personality

Default AI: walls and Bastions early, masses Rhinos, builds Foundries next to factories, attacks in big waves, and turtles when behind.
