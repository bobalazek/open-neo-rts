# Test faction

**Phase:** first playable (phase 2). The faction used for the first playable, AI development, determinism tests and as the baseline in balance reports. Both sides of a first-playable match use it (a mirror match). It has no special mechanics, so problems in the core loop can't hide behind faction quirks.

The numbers are a first pass, to be tuned with the balance tools. The data lives in the developer pack [content/packs/dev](../../../content/packs/dev/), with generated placeholder models: one file per unit, structure and weapon, in human units (cells, seconds) that the loader converts to integers.

## Start

- One **HQ** pre-placed at the spawn, one **Harvester** next to it, and three **Riflemen**.
- 5,000 credits, no materials (the test faction doesn't use materials).
- One ore field near each spawn and one contested field in the middle of the first test map.

## Structures

All structures are grid-placed with the footprint shown ([factions/README.md](README.md#shared-structure-rules)).

| Structure   | Cost           | Build | Power | Health | Footprint | Role                                                       |
| ----------- | -------------- | ----- | ----- | ------ | --------- | ---------------------------------------------------------- |
| HQ          | — (pre-placed) | —     | +20   | 3,000  | 3×3       | Builds structures                                          |
| Power Plant | 600            | 10 s  | +100  | 800    | 2×2       | Power                                                      |
| Refinery    | 1,800          | 20 s  | −30   | 1,500  | 3×3       | Ore → credits; comes with one Harvester                    |
| Barracks    | 500            | 10 s  | −10   | 1,000  | 2×2       | Infantry                                                   |
| Factory     | 2,000          | 20 s  | −30   | 2,000  | 3×3       | Vehicles                                                   |
| Guard Tower | 700            | 12 s  | −20   | 1,200  | 1×1       | Defence: armour-piercing, 30 damage, range 7, reload 1.5 s |

## Units

| Unit           | From     | Cost  | Build | Health | Armour   | Speed (cells/s) | Vision | Weapon                                                            | Pop |
| -------------- | -------- | ----- | ----- | ------ | -------- | --------------- | ------ | ----------------------------------------------------------------- | --- |
| Rifleman       | Barracks | 100   | 5 s   | 100    | infantry | 1.5             | 7      | smallArms 10, range 5, reload 1 s                                 | 1   |
| Rocket Trooper | Barracks | 300   | 8 s   | 100    | infantry | 1.3             | 7      | armorPiercing 50, range 6, reload 3 s                             | 1   |
| Harvester      | Factory  | 1,200 | 15 s  | 800    | heavy    | 1.5             | 6      | none; carries 500 credits                                         | 0   |
| Scout          | Factory  | 400   | 8 s   | 200    | light    | 4.0             | 10     | smallArms 8, range 5, reload 0.5 s                                | 2   |
| Tank           | Factory  | 800   | 15 s  | 600    | heavy    | 2.0             | 8      | armorPiercing 60, range 6, reload 2.5 s, turret                   | 3   |
| Artillery      | Factory  | 900   | 18 s  | 250    | light    | 1.5             | 6      | explosive 80, splash 1.5 cells, range 4–14, reload 5 s, ballistic | 3   |

**Intended counters:** Riflemen beat Rocket Troopers. Rocket Troopers beat Tanks and Scouts. Tanks beat Riflemen and Scouts. Artillery beats static groups and Guard Towers, and loses to Scouts.

## Not in the test faction

Aircraft, naval units, materials, commander powers, tech tiers, upgrades, veterancy and capturing. These arrive with the vertical slice and the official factions.

## Exit check (phase 2)

A full mirror match against the first bot ([ai.md](../../engineering/ai.md#5-first-bot-first-playable)) on the first test map:
- ends by conquest in 10–25 minutes;
- every unit and structure above gets used by at least one side;
- the headless replay reproduces the final state hash.
