# Factions

Three factions fight over the ruins of the 2032 collapse ([story.md](../story.md)):

| Faction                                                       | Identity                                           | Wins by                                                           | Weakness                                  |
| ------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- |
| [Alliance of Free Nations](alliance-of-free-nations.md) (AFN) | Western democracies; technology and precision      | Few superior units: drones, stealth, precision strikes, air power | Expensive losses; slow to recover         |
| [Eastern Collective](eastern-collective.md) (EC)              | Asian industrial powers; mass and electromagnetism | Mass production, heavy armour, fortified bases, EMP               | Slow, power-hungry                        |
| [Phoenix Initiative](phoenix-initiative.md) (PI)              | Mercenaries and resistance networks; adaptation    | Mobility, ambushes, salvage, nanite rebuilding, the Black Market  | Fragile; needs fights to feed its economy |

Every unit and structure of each faction is a definition in `content/core/factions/<faction>/`. The faction docs explain roles; the files hold the numbers.

## Resources

| Resource                             | Comes from                                                 | Used for                                                       |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------- |
| **Credits**                          | Harvesters bring ore to their faction's drop-off structure | Everything                                                     |
| **Raw materials**                    | Material nodes captured and held on the map                | Heavy vehicles, aircraft, naval units, tier 3 and 4 structures |
| **Power**                            | Power structures (a capacity, not a stock)                 | Every structure uses some; shortage causes brownout            |
| **Quantum processing** (Alliance)    | Quantum Research Labs                                      | Research                                                       |
| **Industrial capacity** (Collective) | Producing units                                            | Production surges, mode switches                               |
| **Salvage points** (Phoenix)         | Wrecks processed at the Salvage Center                     | Black Market, field modifications, reconstruction              |

Harvesting, spending and brownout are in [economy.md](../economy.md).

## Shared roles

| Role                   | Alliance of Free Nations | Eastern Collective                  | Phoenix Initiative                   |
| ---------------------- | ------------------------ | ----------------------------------- | ------------------------------------ |
| Headquarters           | Command Hub              | Command Center                      | Command Node (mobile)                |
| **Builder**            | Combat Engineer          | Field Technician                    | Nanite Constructor                   |
| Harvester              | Supply Drone             | Supply Truck                        | Salvage Crawler                      |
| Drop-off               | Supply Relay             | Supply Depot                        | Salvage Center                       |
| Power                  | Power Matrix             | Industrial Reactor                  | Power Generator                      |
| Infantry               | Advanced Barracks        | Barracks Complex                    | Underground Barracks, Mercenary Camp |
| Vehicles               | Vehicle Factory          | War Factory                         | Nanite Factory                       |
| Aircraft               | Drone Assembly Plant     | Airfield                            | Nanite Factory                       |
| Naval                  | Naval Yard               | Shipyard                            | Raft Dock                            |
| Tier 2 (radar, powers) | Cyber Operations Center  | Radar Tower                         | Research Bunker                      |
| Tier 3 (research)      | Quantum Research Lab     | Technology Center, EMP Research Lab | Black Market Hub                     |
| Superweapon (tier 4)   | Satellite Strike Uplink  | EMP Blackout Array                  | Black-market superweapon             |

Drop-off structures, the Collective's Airfield, all naval structures and units, and the Alliance and Collective superweapon structures are additions to the original faction design; each faction doc marks them _Addition_.

## The builder

Every faction has one **builder** unit, trained at its headquarters. Builders are how a base grows ([structures.md](../structures.md#construction-and-builders)):

- they construct every structure on site, and several builders on one structure build it faster;
- they repair structures and capture enemy or neutral buildings;
- they're the only units that can work on a **wonder**, and in team games allies' builders can help build the team's wonder ([objectives-and-victory.md](../objectives-and-victory.md#wonders));
- without builders and a headquarters, a Force can't build anything new.

## Starting a match

Each faction's `faction.json` defines its start kit: the headquarters, two builders, one harvester and three basic infantry, plus the match's starting credits.

## Tech tiers

```text
Tier 1  Headquarters ─► power, drop-off, infantry, vehicles, basic defences
Tier 2  + the faction's radar or support structure ─► aircraft, naval, advanced infantry, the first powers
Tier 3  + the faction's research structure ─► elite units, upgrades, special defences
Tier 4  + the superweapon (one per Force, announced to every player)
```

## Commander powers

Each faction has three powers, unlocked by its headquarters, its tier-2 structure and its superweapon:

| Faction                  | Powers                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| Alliance of Free Nations | Satellite Scan, Cyber Attack, Satellite Strike                     |
| Eastern Collective       | Mass Production Surge, EMP Blackout, Blackout                      |
| Phoenix Initiative       | Guerrilla Operation, Market Manipulation, Black-Market Superweapon |

Powers have cooldowns, warn their target area before landing, and are shared by everyone controlling the Force.

## Shared structure rules

Placement, shore structures, the info panel, rally points, power, upgrades, defences, walls and superweapons work the same for every faction: see [structures.md](../structures.md).

## Eras

The game has one era. Every definition is still era-aware, so later eras can upgrade buildings in place and swap unit variants ([content-and-eras.md §4](../content-and-eras.md#4-eras-and-tech)).
