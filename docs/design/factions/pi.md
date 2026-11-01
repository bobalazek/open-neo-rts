# PI: salvage and adaptation

Guerrillas who build from the battlefield. PI moves its base, ambushes, salvages every wreck, and upgrades units mid-fight. It's strongest when battles keep happening, because every fight feeds its economy.

**Strengths:** mobility, salvage economy, ambush (stealth when still), field upgrades, tunnels.
**Weaknesses:** fragile units and structures, weak static defence, starved in passive games.

## Look

**Patchwork bricks** in mismatched colours over a rust-orange and olive base. Asymmetric builds with exposed studs, odd pieces, flags, tarps and scrap. Every PI unit looks hand-assembled, and field upgrades visibly bolt extra bricks onto the unit.

## Economy twist: salvage

- **Salvage Crawlers** collect wrecks from any battle (any owner's) and bring them to a **Scrap Hub**, which yields materials plus some credits.
- **Ore Pits** gather ore, but slower and cheaper than the other factions' refineries.
- **Rebuild:** Scavengers can rebuild an _enemy_ vehicle wreck into a PI-owned copy at 50% of its cost, with patchwork colours.

## Structures

Costs are credits / materials. Power is + produced or − used.

| Structure       | Tier | Cost        | Power | Role and production                                                   | Ability                                  | Adjacency bonus                                      |
| --------------- | ---- | ----------- | ----- | --------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| Caravan Yard    | 1    | 2500 / 0    | +10   | HQ; builds structures. **Mobile:** packs into a vehicle and redeploys | Pack Up / Deploy                         | —                                                    |
| Generator Shack | 1    | 400 / 0     | +40   | Power (cheap, fragile)                                                | —                                        | Within 4 cells of a Scrap Hub: repairs itself slowly |
| Ore Pit         | 1    | 1200 / 0    | −10   | Ore → credits; comes with a Salvage Crawler                           | —                                        | Next to an ore field: +20% unload speed              |
| Scrap Hub       | 1    | 1000 / 0    | −20   | Wrecks → materials and credits                                        | —                                        | Structures within 4 cells repair 1% health per 2 s   |
| Camp            | 1    | 350 / 0     | −10   | Infantry; **mobile** (packs up)                                       | —                                        | —                                                    |
| Junk Wall       | 1    | 30 / 0      | 0     | Cheap blocking wall; rebuilt from scrap                               | —                                        | —                                                    |
| Scrap Turret    | 1    | 500 / 0     | −10   | Light anti-ground defence                                             | —                                        | Next to a Junk Wall: +20% armour                     |
| Garage          | 1    | 1500 / 0    | −20   | Vehicles; **mobile** (packs up)                                       | —                                        | Within 4 cells of a Scrap Hub: −10% vehicle cost     |
| Lookout         | 2    | 1000 / 0    | −20   | Radar; unlocks support powers; T2                                     | —                                        | —                                                    |
| Kite Field      | 2    | 1000 / 150  | −20   | Light aircraft                                                        | —                                        | —                                                    |
| Raft Dock       | 2    | 900 / 100   | −10   | Naval units                                                           | —                                        | —                                                    |
| Rocket Nest     | 2    | 700 / 50    | −20   | Anti-air                                                              | —                                        | —                                                    |
| Tunnel Entrance | 2    | 800 / 100   | −10   | Linked tunnel network: units enter one and exit any other             | —                                        | —                                                    |
| Workshop        | 3    | 2000 / 300  | −40   | Field upgrades; unlocks T3                                            | Mod kits: apply upgrades to units nearby | —                                                    |
| Junk Rocket     | 4    | 4000 / 2000 | −100  | Strategic: an inaccurate but huge scrap missile (cooldown 6 min)      | —                                        | —                                                    |

## Field upgrades

Instead of only global research, PI buys **mod kits** at a Workshop and bolts them onto individual units within its range. Each vehicle has 2 mod slots:

- **Armour plates:** +25% health, −10% speed.
- **Bigger gun:** +30% damage, −15% rate of fire.
- **Rocket pod:** adds an anti-air weapon.
- **Nitro:** speed burst ability.
- **Camo net:** stealth when stationary.

The kits are visible on the model as extra bricks.

## Tech tree

```text
Caravan Yard (mobile)
├── Generator Shack
├── Ore Pit, Scrap Hub
├── Camp ── Raider, Rocketeer, Scavenger
├── Junk Wall, Scrap Turret
└── Garage ── Salvage Crawler, Technical, Junker
    └── Lookout (T2) ── Lobber, Saboteur · powers: Ambush, Scrap Rain
        ├── Kite Field ── Gyro
        ├── Raft Dock ── Raft, Gunraft
        ├── Rocket Nest, Tunnel Entrance
        └── Workshop (T3) ── Kite Bomber, Ram Boat, Scrap Walker · mod kits
            └── Junk Rocket (T4)
```

## Units

| Unit            | Domain   | Tier | Cost       | Role                                                          | Strong vs            | Weak vs          |
| --------------- | -------- | ---- | ---------- | ------------------------------------------------------------- | -------------------- | ---------------- |
| Raider          | Infantry | 1    | 120 / 0    | SMG infantry; fast                                            | Infantry             | Vehicles         |
| Rocketeer       | Infantry | 1    | 300 / 0    | AT rockets; can fire on the move                              | Vehicles             | Infantry         |
| Scavenger       | Infantry | 1    | 400 / 0    | Engineer: capture, repair, rebuild enemy wrecks               | —                    | Everything       |
| Saboteur        | Infantry | 2    | 700 / 50   | Stealthy; plants charges, disables structures                 | Structures           | Detection        |
| Salvage Crawler | Vehicle  | 1    | 900 / 0    | Collects wrecks and ore                                       | —                    | —                |
| Technical       | Vehicle  | 1    | 450 / 0    | Fast pickup with machine gun; 2 mod slots                     | Infantry             | Tanks            |
| Junker          | Vehicle  | 1    | 700 / 50   | Patchwork tank; 50% cheaper when built from a wreck           | Vehicles             | Infantry AT, air |
| Lobber          | Vehicle  | 2    | 1000 / 100 | Junk mortar; splash                                           | Infantry, structures | Fast units       |
| Scrap Walker    | Vehicle  | 3    | 2200 / 300 | Big walker made of wrecks; steps over Junk Walls; 4 mod slots | Vehicles, structures | Air              |
| Gyro            | Air      | 2    | 800 / 100  | Gyrocopter scout and harasser                                 | Infantry             | AA               |
| Kite Bomber     | Air      | 3    | 1400 / 250 | Glider bomber; silent until it drops                          | Structures           | AA               |
| Raft            | Naval    | 2    | 400 / 0    | Transport for 6 infantry or 1 vehicle                         | —                    | Everything       |
| Gunraft         | Naval    | 2    | 800 / 100  | Armed raft with a mortar                                      | Infantry, shore      | Ships            |
| Ram Boat        | Naval    | 3    | 1200 / 150 | Explosive ram; one-shot heavy damage to ships                 | Ships                | Guns, air        |

## Commander powers

- **Ambush:** all units in an area become stealthed until they fire.
- **Scrap Rain:** drops salvage piles (materials) or debris (damage) on a target area.
- **Rally:** +30% speed for units in an area for 15 s.
- **Junk Rocket** (strategic structure).

## AI personality

Default AI: relocates its base often, raids harvesters, follows every battle with Salvage Crawlers, uses tunnels for flanks, and avoids head-on fights with tanks.
