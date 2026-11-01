# Eastern Collective

Formed from the merger of several Asian industrial powerhouses ([story.md](../story.md)). It wins through overwhelming force: mass production, adaptable hybrid units and electromagnetic weapons.

**Plays as:** numbers and durability. Units are cheap for their toughness, the base is fortified, and EMP shuts down an enemy that depends on technology. The army is slower and the base is power-hungry.

| Strengths                            | Weaknesses                          |
| ------------------------------------ | ----------------------------------- |
| Rapid deployment, superior numbers   | Slow units                          |
| Versatile unit modes (siege, bunker) | High power demand                   |
| Electromagnetic weapons              | Weak against stealth and long range |

Short form: EC. Content folder: [content/core/factions/eastern-collective/](../../../content/core/factions/eastern-collective/). Costs and stats live in each `unit.json` and `structure.json`.

## Look

Dark steel-grey and **brick-red** bricks with **yellow-and-black hazard stripes**. Thick, boxy shapes, smokestacks puffing brick-cube smoke, riveted plates and big treads. Structures are large and blocky, with chimneys and conveyor details.

## Economy

- **Credits:** armoured Supply Trucks bring ore to a Supply Depot.
- **Raw materials:** from captured material nodes on the map.
- **Industrial capacity** (unique): earned by producing units, spent on the **Mass Production Surge** (faster production for a while) and on Dragon Tank and APC mode switches.

## Builder

**Field Technician.** Trained at the Command Center. Builds every structure on site, repairs, captures, and contributes to wonders.

## Structures

| Structure          | Tier | Role         | Notes                                                                             |
| ------------------ | ---- | ------------ | --------------------------------------------------------------------------------- |
| Command Center     | 1    | Headquarters | Trains Field Technicians; has its own guns; **Mass Production Surge**             |
| Industrial Reactor | 1    | Power        | Fusion power; +10% per adjacent reactor (up to 3)                                 |
| Supply Depot       | 1    | Economy      | Supply Truck drop-off; comes with one Supply Truck. _Addition_                    |
| Barracks Complex   | 1    | Infantry     | Trains two infantry at a time                                                     |
| War Factory        | 1    | Vehicles     | Mass vehicle production                                                           |
| Fortress Wall      | 1    | Defence      | Heavy wall with mounted guns; placed by dragging                                  |
| Anti-Air Complex   | 1    | Defence      | Missile and gun anti-air                                                          |
| Radar Tower        | 2    | Support      | Early warning with jamming; unlocks tier 2 and the **EMP Blackout** power         |
| Airfield           | 2    | Aircraft     | Builds and rearms aircraft. _Addition_                                            |
| Propaganda Center  | 2    | Support      | **Rally Broadcast**: +15% damage and speed nearby                                 |
| Artillery Platform | 2    | Defence      | Fixed long-range artillery                                                        |
| Tesla Coil         | 2    | Defence      | Electromagnetic defence: damages and disables vehicles                            |
| Shipyard           | 2    | Naval        | Coastal. _Addition_                                                               |
| Technology Center  | 3    | Research     | Unlocks tier 3; Reinforced Plating, Assembly Lines                                |
| EMP Research Lab   | 3    | Research     | Electromagnetic weapons; Hardened Circuits; unlocks Tesla Troopers and Mobile EMP |
| EMP Blackout Array | 4    | Superweapon  | City-scale EMP, after Operation Blackout; announced to all players. _Addition_    |

## Units

| Unit                   | Type     | Built at         | Role                                                                             | Strong against       | Weak against              |
| ---------------------- | -------- | ---------------- | -------------------------------------------------------------------------------- | -------------------- | ------------------------- |
| Collective Soldier     | Infantry | Barracks Complex | Cheap assault-rifle infantry                                                     | Infantry             | Vehicles, fire            |
| Rocket Trooper         | Infantry | Barracks Complex | Anti-vehicle                                                                     | Vehicles             | Infantry                  |
| Drone Hunter           | Infantry | Barracks Complex | Signature anti-air infantry                                                      | Drones, low aircraft | Infantry, vehicles        |
| Field Technician       | Infantry | Command Center   | **Builder**: build, repair, capture                                              | —                    | Everything                |
| Infiltrator            | Infantry | Barracks Complex | Stealth reconnaissance                                                           | —                    | Detection                 |
| Tesla Trooper          | Infantry | Barracks Complex | EMP weapons that disable vehicles                                                | Vehicles             | Infantry                  |
| Supply Truck           | Vehicle  | War Factory      | Armoured harvester with a machine gun                                            | Light raiders        | Tanks                     |
| Dragon Tank            | Vehicle  | War Factory      | The Metamorphic Battle Tank: **Siege Mode** adds range and damage but can't move | Vehicles, structures | Air, massed anti-tank     |
| Metamorphic APC        | Vehicle  | War Factory      | Transport for 5; **Bunker Mode** turns it into a fortified bunker                | Infantry             | Tanks                     |
| Flame Tank             | Vehicle  | War Factory      | Area denial; clears infantry and garrisons                                       | Infantry, garrisons  | Tanks                     |
| Mobile EMP             | Vehicle  | War Factory      | Signature EMP artillery                                                          | Vehicles (disable)   | Fast units, infantry      |
| Mobile Factory Complex | Vehicle  | War Factory      | Signature: drives forward and deploys into a War Factory                         | —                    | Everything until deployed |
| Scout Helicopter       | Aircraft | Airfield         | Fast reconnaissance                                                              | Infantry             | Anti-air                  |
| Gunship                | Aircraft | Airfield         | Close air support                                                                | Vehicles             | Anti-air                  |
| Thunder Fighter        | Aircraft | Airfield         | Multi-role jet: air superiority and strafing                                     | Aircraft             | Anti-air                  |
| Heavy Transport        | Aircraft | Airfield         | Armoured transport for 10 infantry                                               | —                    | Fighters                  |
| Strategic Bomber       | Aircraft | Airfield         | Long-range carpet bombing                                                        | Structures, groups   | Fighters, anti-air        |
| Gunboat                | Naval    | Shipyard         | Cheap patrol. _Addition_                                                         | Boats, infantry      | Destroyers                |
| Destroyer              | Naval    | Shipyard         | All-round warship: shore bombardment, torpedoes. _Addition_                      | Ships, shore         | Air                       |

## Tech tree

```text
Command Center ── Field Technician
├── Industrial Reactor · Supply Depot · Fortress Wall · Anti-Air Complex
├── Barracks Complex ── Collective Soldier, Rocket Trooper, Drone Hunter
├── War Factory ── Supply Truck, Dragon Tank, Metamorphic APC
└── Radar Tower (tier 2) ── power: EMP Blackout
    ├── Barracks Complex ── Infiltrator
    ├── War Factory ── Flame Tank
    ├── Airfield ── Scout Helicopter, Gunship, Thunder Fighter, Heavy Transport
    ├── Propaganda Center · Artillery Platform · Tesla Coil · Shipyard ── Gunboat, Destroyer
    └── Technology Center (tier 3) ── Mobile Factory Complex, Strategic Bomber
        └── EMP Research Lab ── Tesla Trooper, Mobile EMP
            └── EMP Blackout Array (tier 4)
```

## Commander powers

From the world document: **mass production surges** and **EMP blackouts**.

| Power                 | Unlocked by        | Effect                                                                         |
| --------------------- | ------------------ | ------------------------------------------------------------------------------ |
| Mass Production Surge | Command Center     | +50% production speed for 20 seconds; costs industrial capacity                |
| EMP Blackout          | Radar Tower        | Disables vehicles and structures in a wide area for 12 seconds                 |
| Blackout              | EMP Blackout Array | The superweapon: disables and damages everything in a huge area for 30 seconds |

## Campaign

**Iron Dynasty:** Commander Wei Zhang works to unite the Eastern Collective and prove that human determination can triumph over technological superiority.

## Bot personality

Walls up early, masses Dragon Tanks, builds reactors next to each other, attacks in large waves, and turtles when behind.
