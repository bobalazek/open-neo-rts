# AFN: technology and precision

A small, expensive, highly capable army. AFN wins engagements through range, information and precision, and loses badly when its few units die.

**Strengths:** stealth and detection, drones, shields, long-range precision, support powers.
**Weaknesses:** high unit cost, slow to replace losses, research gated by compute.

## Look

Clean white and light-grey bricks with **cyan translucent "glass" bricks** for sensors, cockpits and shields. Slim, angular silhouettes; hover pads instead of wheels on light vehicles. Small glowing studs show power and status. Structures are compact, modular, and connected by light-strip walkways.

## Economy twist: compute

**Data Cores** provide _compute_, a capacity resource like power. Every active research project uses compute, so AFN researches faster with more cores and can't research everything at once. Cores are fragile, high-value targets.

## Structures

Costs are credits / materials. Power is + produced or − used.

| Structure           | Tier | Cost        | Power | Role and production                                            | Ability                                  | Adjacency bonus                                         |
| ------------------- | ---- | ----------- | ----- | -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Command Nexus       | 1    | 3000 / 0    | +10   | HQ; builds all structures                                      | Overwatch Scan: reveals an area for 10 s | —                                                       |
| Fusion Cell         | 1    | 600 / 0     | +60   | Power                                                          | —                                        | Each adjacent Fusion Cell: +10% output (max 3)          |
| Refinery            | 1    | 1800 / 0    | −20   | Ore → credits; comes with a Harvester Drone                    | —                                        | Next to an ore field: +20% unload speed                 |
| Training Facility   | 1    | 500 / 0     | −10   | Infantry                                                       | —                                        | —                                                       |
| Pulse Turret        | 1    | 700 / 0     | −20   | Anti-ground defence                                            | —                                        | Within 6 cells of an Uplink Array: +2 range             |
| Assembly Plant      | 1    | 2000 / 0    | −30   | Vehicles and drones                                            | —                                        | Within 4 cells of a Data Core: +15% build speed         |
| Uplink Array        | 2    | 1500 / 0    | −40   | Radar; unlocks support powers; T2                              | —                                        | —                                                       |
| Aerodrome           | 2    | 1200 / 300  | −30   | Aircraft; 4 landing pads (rearm)                               | —                                        | —                                                       |
| Naval Dock          | 2    | 1200 / 200  | −20   | Naval units                                                    | —                                        | —                                                       |
| Data Core           | 2    | 1000 / 200  | −40   | +4 compute                                                     | —                                        | Research structures within 4 cells: +15% research speed |
| Interceptor Battery | 2    | 1000 / 100  | −30   | Anti-air; shoots down missiles                                 | —                                        | —                                                       |
| Shield Pylon        | 3    | 1500 / 400  | −60   | Shield bubble absorbing damage over nearby structures          | Overcharge: double the shield for 8 s    | Shields of overlapping pylons don't stack               |
| Research Lab        | 3    | 2500 / 500  | −60   | Upgrades; unlocks T3                                           | —                                        | —                                                       |
| Orbital Lance       | 4    | 5000 / 2000 | −150  | Strategic: a precision beam strike on a point (cooldown 6 min) | —                                        | —                                                       |

## Tech tree

```text
Command Nexus
├── Fusion Cell
├── Refinery
├── Training Facility ── Ranger, Lancer, Engineer
├── Pulse Turret
└── Assembly Plant ── Harvester Drone, Wisp, Swarm Pack
    └── Uplink Array (T2) ── Panther, Mantis, Repair Drone · powers: Drone Recon, Precision Strike
        ├── Aerodrome ── Raptor
        ├── Naval Dock ── Skiff, Trident
        ├── Data Core ── (compute)
        ├── Interceptor Battery
        └── Research Lab (T3) ── Ghost, Arc, Stratus, Abyss · Shield Pylon · upgrades
            └── Orbital Lance (T4)
```

Key research: Composite Armor (+15% vehicle health), Smart Munitions (+10% accuracy), Drone Swarm Logic (+1 drone per pack), Active Camouflage (Panther stealth when stationary), Shield Harmonics (+25% shield).

## Units

| Unit            | Domain   | Tier | Cost       | Role                                                               | Strong vs           | Weak vs             |
| --------------- | -------- | ---- | ---------- | ------------------------------------------------------------------ | ------------------- | ------------------- |
| Ranger          | Infantry | 1    | 200 / 0    | Rifle infantry                                                     | Infantry            | Vehicles, fire      |
| Lancer          | Infantry | 1    | 350 / 0    | AT missiles; can hit air at reduced damage                         | Vehicles            | Infantry            |
| Engineer        | Infantry | 1    | 500 / 0    | Capture, repair, defuse                                            | —                   | Everything          |
| Ghost           | Infantry | 3    | 900 / 100  | Stealth sniper and spotter; laser-designates for precision strikes | Infantry            | Detection, vehicles |
| Harvester Drone | Vehicle  | 1    | 1200 / 0   | Gathers ore; hovering                                              | —                   | —                   |
| Wisp            | Vehicle  | 1    | 500 / 0    | Fast hover scout; detects stealth                                  | Infantry            | Tanks               |
| Swarm Pack      | Drone    | 1    | 600 / 0    | 4 cheap kamikaze drones                                            | Vehicles, artillery | AA, small arms      |
| Panther         | Vehicle  | 2    | 1400 / 200 | Main battle tank; long-range railgun                               | Vehicles            | Infantry AT, air    |
| Mantis          | Vehicle  | 2    | 1000 / 100 | AA missiles; jams enemy radar nearby                               | Air                 | Tanks               |
| Repair Drone    | Drone    | 2    | 700 / 0    | Repairs vehicles in range                                          | —                   | Everything          |
| Arc             | Vehicle  | 3    | 1800 / 300 | Guided long-range artillery; needs a spotter for max range         | Structures, groups  | Fast units          |
| Raptor          | Air      | 2    | 1500 / 300 | VTOL gunship                                                       | Vehicles            | AA                  |
| Stratus         | Air      | 3    | 2600 / 600 | Stealth bomber                                                     | Structures          | AA, detection       |
| Skiff           | Naval    | 2    | 700 / 100  | Fast patrol boat; transport for 4 infantry                         | Infantry, boats     | Frigates            |
| Trident         | Naval    | 2    | 1800 / 300 | Missile frigate; anti-air and anti-ship                            | Ships, air          | Submarines          |
| Abyss           | Naval    | 3    | 2200 / 400 | Stealth submarine; torpedoes                                       | Ships               | Detection, Skiffs   |

## Commander powers

- **Drone Recon:** reveal a large area for 15 s.
- **Precision Strike:** heavy damage to a single target; much stronger on laser-designated targets.
- **Shield Surge:** temporary shields on all units in an area.
- **Orbital Lance** (strategic structure).

## AI personality

Default AI: techs early, protects its Data Cores, harasses with drones, picks fights at range, and retreats damaged units for repair.
