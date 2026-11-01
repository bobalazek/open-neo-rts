# Phoenix Initiative

A decentralised network of private military companies, tech corporations and resistance movements that rose from the ashes of failed states ([story.md](../story.md)). It specialises in unconventional warfare and adaptive technology.

**Plays as:** guerrillas who build from the battlefield. The base can move, units ambush from stealth, every wreck becomes resources, and the Black Market sells what the factories can't make. It's strongest when battles keep happening, because fights feed its economy.

| Strengths                            | Weaknesses                   |
| ------------------------------------ | ---------------------------- |
| Guerrilla tactics, stealth, mobility | Fragile units and structures |
| Salvage and nanite rebuilding        | Weak static defence          |
| Mercenaries and experimental weapons | Starved in passive games     |

Short form: PI. Content folder: [content/core/factions/phoenix-initiative/](../../../content/core/factions/phoenix-initiative/). Costs and stats live in each `unit.json` and `structure.json`.

## Look

**Patchwork bricks** in mismatched colours over a rust-orange and olive base. Asymmetric builds with exposed studs, odd pieces, flags, tarps and scrap. Every unit looks hand-assembled, and field modifications visibly bolt extra bricks on.

## Economy

- **Credits and raw materials:** Salvage Crawlers gather ore and wrecks and bring them to a Salvage Center. Scavenger VTOLs lift salvage from anywhere.
- **Salvage points** (unique): earned from every wreck processed, from any battle and any owner. Spent at the Black Market Hub (Market Manipulation, the black-market superweapon), on field modifications and on nanite reconstruction.

## Builder

**Nanite Constructor**, the world document's "mobile repair and building unit". Built at the Command Node. Builds every structure on site, repairs, rebuilds wrecks into working Phoenix vehicles, and contributes to wonders. Salvage Experts can also repair and capture, but don't build.

## Structures

| Structure              | Tier | Role                  | Notes                                                                                                                       |
| ---------------------- | ---- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Command Node           | 1    | Headquarters          | **Relocate**: packs into a vehicle and redeploys elsewhere                                                                  |
| Power Generator        | 1    | Power                 | Cheap, light power                                                                                                          |
| Salvage Center         | 1    | Economy               | Turns debris and ore into credits, materials and salvage points; Salvage Crawler drop-off; slowly repairs nearby structures |
| Underground Barracks   | 1    | Infantry              | Concealed: hidden from enemy vision unless detected                                                                         |
| Nanite Factory         | 1    | Vehicles and aircraft | Builds from nanite-assembled scrap; Nanite Repair research                                                                  |
| Adaptive Defense Tower | 1    | Defence               | Morphs to the threat: hits ground and air                                                                                   |
| Nanite Wall            | 1    | Defence               | Self-repairing wall; placed by dragging                                                                                     |
| Guerrilla Bunker       | 1    | Defence               | Hidden position; garrisons 4 infantry                                                                                       |
| Research Bunker        | 2    | Research              | Unlocks tier 2; **Guerrilla Operation** power; Experimental Weapons research                                                |
| Mercenary Camp         | 2    | Infantry              | Recruits Mercenaries                                                                                                        |
| Stealth Generator      | 2    | Support               | Cloaks friendly units and structures nearby                                                                                 |
| Raft Dock              | 2    | Naval                 | Coastal. _Addition_                                                                                                         |
| Black Market Hub       | 3    | Support               | **Market Manipulation**; the **black-market superweapon**                                                                   |

## Units

| Unit               | Type     | Built at             | Role                                                   | Strong against            | Weak against           |
| ------------------ | -------- | -------------------- | ------------------------------------------------------ | ------------------------- | ---------------------- |
| Insurgent          | Infantry | Underground Barracks | Fast, cheap guerrilla infantry                         | Infantry                  | Vehicles               |
| Salvage Expert     | Infantry | Underground Barracks | Gathers salvage, repairs, captures                     | —                         | Everything             |
| Saboteur           | Infantry | Underground Barracks | Stealth demolitions                                    | Structures                | Detection              |
| Nanite Specialist  | Infantry | Underground Barracks | Nanite swarms eat armour                               | Vehicles                  | Infantry               |
| Mercenary          | Infantry | Mercenary Camp       | Expensive veteran infantry with rifle and rockets      | Infantry, vehicles        | Numbers, fire          |
| Salvage Crawler    | Vehicle  | Nanite Factory       | Harvester with a machine gun                           | Light raiders             | Tanks                  |
| Raider Buggy       | Vehicle  | Nanite Factory       | Fast attack vehicle                                    | Infantry, harvesters      | Tanks                  |
| Scorpion Tank      | Vehicle  | Nanite Factory       | Light tank, stealthed while still                      | Vehicles                  | Heavy tanks, detection |
| Mobile Workshop    | Vehicle  | Nanite Factory       | Field repairs and **Field Modification**               | —                         | Everything             |
| Nanite Constructor | Vehicle  | Command Node         | **Builder**; **Reconstruct** rebuilds wrecks           | —                         | Everything             |
| Strike Drone       | Drone    | Nanite Factory       | Automated attack aircraft                              | Infantry, light vehicles  | Anti-air               |
| Scavenger VTOL     | Aircraft | Nanite Factory       | Air harvester: lifts salvage                           | —                         | Anti-air               |
| Stealth Transport  | Aircraft | Nanite Factory       | Cloaked transport for 6                                | —                         | Detection              |
| Phoenix Gunship    | Aircraft | Nanite Factory       | Experimental plasma gunship                            | Ground forces, structures | Anti-air               |
| Nanite Storm       | Aircraft | Nanite Factory       | Area denial: damages everything beneath it             | Infantry, structures      | Fighters, anti-air     |
| Raider Skiff       | Naval    | Raft Dock            | Fast armed boat; carries 4. _Addition_                 | Boats, infantry           | Warships               |
| Scrap Monitor      | Naval    | Raft Dock            | Improvised gun barge for shore bombardment. _Addition_ | Shore, ships              | Torpedoes, air         |

## Tech tree

```text
Command Node (mobile) ── Nanite Constructor
├── Power Generator · Salvage Center · Adaptive Defense Tower · Nanite Wall · Guerrilla Bunker
├── Underground Barracks ── Insurgent, Salvage Expert
├── Nanite Factory ── Salvage Crawler, Raider Buggy, Scorpion Tank
└── Research Bunker (tier 2) ── power: Guerrilla Operation
    ├── Underground Barracks ── Saboteur, Nanite Specialist
    ├── Nanite Factory ── Mobile Workshop, Strike Drone, Scavenger VTOL, Stealth Transport,
    │                     Phoenix Gunship, Nanite Storm
    ├── Mercenary Camp ── Mercenary
    ├── Stealth Generator · Raft Dock ── Raider Skiff, Scrap Monitor
    └── Black Market Hub (tier 3) ── power: Market Manipulation; black-market superweapon (tier 4)
```

## Commander powers

From the world document: **guerrilla operations** and **market manipulation**.

| Power                    | Unlocked by      | Effect                                                                                                  |
| ------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------- |
| Guerrilla Operation      | Research Bunker  | Every unit in an area is stealthed until it fires                                                       |
| Market Manipulation      | Black Market Hub | Converts 50 salvage points into 1,500 credits                                                           |
| Black-Market Superweapon | Black Market Hub | The superweapon: bought for credits and salvage, then fired once at any point; announced to all players |

## Campaign

**Phoenix Rising:** the mysterious "Director" turns scattered resistance groups into a formidable global force.

## Bot personality

Relocates its base often, raids harvesters, follows every battle with Salvage Crawlers, ambushes from stealth, and avoids head-on fights with tanks.
