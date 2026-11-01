# Factions (the world of 2035)

The first game pack has three asymmetric factions, plus a mirrored **test faction** used for balance work and the first playable.

| Faction       | Identity                 | Wins by                                                                    | Weakness                                                       |
| ------------- | ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [AFN](afn.md) | Technology and precision | Few expensive, superior units; drones, stealth, shields, precision strikes | Expensive losses; slow to recover                              |
| [EC](ec.md)   | Industrial superiority   | Mass production, heavy armour, strong defences, EMP                        | Slow, power-hungry, predictable                                |
| [PI](pi.md)   | Salvage and adaptation   | Mobility, ambushes, salvaging wrecks, upgrading units mid-battle           | Fragile units and structures; needs fights to feed its economy |

Lore, campaigns and the signature roster come from [world-2035.md](world-2035.md), which wins on names and story. The per-faction docs turn it into rules: costs, tiers, counters.

## Resources

| Resource      | Kind     | Comes from                                                      | Spent on                                            |
| ------------- | -------- | --------------------------------------------------------------- | --------------------------------------------------- |
| **Credits**   | Stock    | Harvesters bring ore to a refinery; trade and captured derricks | Everything                                          |
| **Materials** | Stock    | Rare-metal nodes; **salvage** from wrecks                       | Heavy vehicles, aircraft, naval, tier 3+ structures |
| **Power**     | Capacity | Power structures                                                | Consumed continuously by structures                 |

**Brownout:** when power use exceeds supply, production and research slow to 50%, defences that need power go offline, and radar is disabled. The resource bar shows it in red.

Faction twists: AFN adds **compute** (capacity from Data Cores, which gates research), EC converts credits to materials in Foundries, and PI gets most of its materials from salvage.

## Structure roles

Every faction covers the same roles with its own structures:

| Role                              | AFN                     | EC                | PI                    |
| --------------------------------- | ----------------------- | ----------------- | --------------------- |
| Headquarters (builds structures)  | Command Nexus           | Construction Yard | Caravan Yard (mobile) |
| Power                             | Fusion Cell             | Turbine Plant     | Generator Shack       |
| Economy                           | Refinery                | Refinery          | Ore Pit, Scrap Hub    |
| Infantry                          | Training Facility       | Conscript Hall    | Camp                  |
| Vehicles                          | Assembly Plant          | War Factory       | Garage                |
| Aircraft                          | Aerodrome               | Airstrip          | Kite Field            |
| Naval                             | Naval Dock              | Shipyard          | Raft Dock             |
| Radar and support powers (tier 2) | Uplink Array            | Command Bunker    | Lookout               |
| Advanced tech (tier 3)            | Research Lab            | Industrial Lab    | Workshop              |
| Faction special                   | Data Core, Shield Pylon | Foundry, EMP Coil | Tunnel Entrance       |
| Strategic (tier 4)                | Orbital Lance           | Thunder Battery   | Junk Rocket           |

## Shared structure rules

- **Grid placement:** structures have footprints in whole cells (e.g. 2×2, 3×4) and snap to the map grid; free-form placement isn't possible. Rotation is in 90° steps, and exits and docking points are part of the footprint. Placement needs flat, buildable cells on a single height level, inside the build radius, with no units in the way (they're asked to move).
- **Build radius:** new structures must be placed within a few cells of an existing structure (or inside own territory in territory rulesets). Defences have a smaller radius.
- **Construction:** HQ-built, queued from the build panel, then placed (C&C-style). Placement is validated in the sim.
- **Sell** for a 50% refund. **Repair** costs credits over time. **Capture** with engineers where the ruleset allows.
- **Naval structures** must sit on a coastline cell, with their exit in deep water.
- **Upgrades:** some structures have upgrades of their own (an extra production slot, armour, range).

## Adjacency bonuses

Structures can boost structures near them, which rewards deliberate base layout.

- Each structure definition can declare `adjacency` effects: "structures with tag X within N cells get modifier Y". The effects are typed: production speed, research speed, power output, repair over time, range or accuracy.
- Bonuses **stack up to a cap** per effect (usually 2–3 sources) and are recalculated deterministically whenever a structure finishes or is destroyed.
- **When placing,** the ghost structure draws link lines to the structures it would boost or be boosted by, and shows the resulting bonus.
- Each faction's adjacency bonuses are listed in its structure table.

## Eras

The 2035 game has one era. Every structure and unit definition is still era-aware, so a later multi-era profile can upgrade buildings in place and swap unit variants when a Force advances. See [content-and-eras.md §4](../content-and-eras.md#4-eras-and-tech).

## Tech tiers

```text
T1  HQ ─► power, economy, infantry, basic defence
T2  + Radar/support structure ─► vehicles' full roster, aircraft, naval, support powers
T3  + Advanced tech structure ─► elite units, upgrades, special defences
T4  + Strategic structure (one per Force, announced to all players when built)
```

Research (upgrades) happens in specific structures and costs credits, and for AFN also compute. Tech trees are content data and validated for cycles and unreachable nodes.

## Units and domains

Every faction fields infantry, vehicles, aircraft and **naval** units. Naval units use water navigation, are built at the naval structure, and include transports, so naval maps open amphibious attacks. Counters follow the damage and armor matrix in [combat-and-balance.md](../combat-and-balance.md).

## Commander powers

Each faction has three commander powers ([world-2035.md](world-2035.md#commander-abilities)). Two unlock with its radar structure (tier 2) and the third with its tier-3 structure. Powers cost nothing to use; each has a cooldown (60–240 s, set per power) and gives its target area a short visible warning before it lands. Everyone controlling the Force shares the powers and their cooldowns. The full commander skill tree ([content-and-eras.md §4](../content-and-eras.md#4-eras-and-tech)) builds on this later.

## Test faction

A plain, symmetric faction with one structure per role and one unit per job: rifle infantry, anti-tank infantry, light vehicle, tank, artillery, AA vehicle, gunship, gunboat. It has no special mechanics. It's used for the first playable, for AI development, and as the baseline in balance reports.
