# Alliance of Free Nations

A coalition of Western democracies that kept its technological edge through the 2032 collapse ([story.md](../story.md)). It fields superior drone technology, cyber warfare and precision strikes, but struggles with limited manpower and resources.

**Plays as:** a small, expensive, highly capable army. It wins fights through range, information and air power, and loses badly when its few units die.

| Strengths                             | Weaknesses                           |
| ------------------------------------- | ------------------------------------ |
| AI-driven combat systems and drones   | Expensive units; losses hurt         |
| Stealth and detection                 | Research gated by quantum processing |
| Precision strikes, superior air power | Weak, few infantry                   |

Short form: AFN. Content folder: [content/core/factions/alliance-of-free-nations/](../../../content/core/factions/alliance-of-free-nations/). Costs and stats live in each unit's and structure's `unit.json` or `structure.json`; this doc explains roles and how the faction plays.

## Look

Clean white and light-grey bricks, with **cyan translucent bricks** for sensors, cockpits and shields. Slim, angular silhouettes; hover pads on drones; small glowing studs for power and status. Structures are compact and modular, connected by light-strip walkways.

## Economy

- **Credits:** Supply Drones hover to ore fields and back to a Supply Relay.
- **Raw materials:** from captured material nodes on the map ([economy.md](../economy.md)).
- **Quantum processing** (unique): a capacity provided by the Quantum Research Lab. Every Alliance research project uses some, so more labs mean faster research, and losing a lab stalls research.

## Builder

**Combat Engineer.** Trained at the Command Hub. It builds every structure on site, repairs, captures enemy and neutral buildings, and contributes to wonders ([structures.md](../structures.md#construction-and-builders)).

## Structures

| Structure                | Tier | Role         | Notes                                                                                   |
| ------------------------ | ---- | ------------ | --------------------------------------------------------------------------------------- |
| Command Hub              | 1    | Headquarters | Trains Combat Engineers; minimap and radar built in; **Satellite Scan** reveals an area |
| Power Matrix             | 1    | Power        | +10% output for each adjacent Power Matrix (up to 3)                                    |
| Supply Relay             | 1    | Economy      | Supply Drone drop-off; comes with one Supply Drone. _Addition_                          |
| Advanced Barracks        | 1    | Infantry     | Medical bay slowly heals nearby infantry                                                |
| Vehicle Factory          | 1    | Vehicles     | Robotic assembly lines                                                                  |
| Smart Turret             | 1    | Defence      | AI-controlled cannon that adapts its targeting                                          |
| Anti-Air Matrix          | 1    | Defence      | Predictive anti-air; its point defence shoots down missiles                             |
| Cyber Operations Center  | 2    | Support      | Unlocks tier 2; **Cyber Attack** power disables enemy structures                        |
| Drone Assembly Plant     | 2    | Aircraft     | Drones and VTOLs; pads rearm aircraft                                                   |
| Advanced Armory          | 2    | Research     | Weapons and equipment upgrades (Smart Munitions, Adaptive Armor)                        |
| Sensor Array             | 2    | Detection    | Reveals stealth units and infantry                                                      |
| Naval Yard               | 2    | Naval        | Coastal: back row on land, front row in deep water. _Addition_                          |
| Quantum Research Lab     | 3    | Research     | Unlocks tier 3; provides quantum processing; Ghost Protocol research                    |
| Photon Barrier Generator | 3    | Defence      | Energy shield over nearby structures; **Overcharge** doubles it                         |
| Satellite Strike Uplink  | 4    | Superweapon  | Orbital strike anywhere; announced to all players. _Addition_                           |

## Units

| Unit                  | Type     | Built at             | Role                                                      | Strong against           | Weak against            |
| --------------------- | -------- | -------------------- | --------------------------------------------------------- | ------------------------ | ----------------------- |
| Tactical Operator     | Infantry | Advanced Barracks    | Smart-linked rifle infantry                               | Infantry                 | Vehicles, fire          |
| Combat Engineer       | Infantry | Command Hub          | **Builder**: build, repair, capture                       | —                        | Everything              |
| Heavy Gunner          | Infantry | Advanced Barracks    | Exoskeleton anti-vehicle                                  | Vehicles, low aircraft   | Infantry                |
| Cyber Specialist      | Infantry | Advanced Barracks    | **Hack** disables a vehicle or structure; long vision     | Vehicles (disable)       | Infantry                |
| Ghost Recon           | Infantry | Advanced Barracks    | Stealth sniper and spotter                                | Infantry                 | Detection, vehicles     |
| Supply Drone          | Drone    | Vehicle Factory      | Harvester (hovers)                                        | —                        | —                       |
| Panther MBT           | Vehicle  | Vehicle Factory      | Main battle tank, railgun, adaptive armour                | Vehicles                 | Infantry anti-tank, air |
| Striker IFV           | Vehicle  | Vehicle Factory      | Infantry fighting vehicle; carries 4                      | Infantry, light air      | Tanks                   |
| Mobile Artillery      | Vehicle  | Vehicle Factory      | Long-range guided artillery                               | Structures, groups       | Fast units              |
| Recovery Vehicle      | Vehicle  | Vehicle Factory      | Field repair and wreck salvage                            | —                        | Everything              |
| Command APC           | Vehicle  | Vehicle Factory      | Transport for 6; **Battlefield Link** boosts nearby units | Infantry                 | Tanks                   |
| Recon Drone           | Drone    | Drone Assembly Plant | Stealth surveillance, long vision                         | —                        | Anti-air                |
| Ghost Drone Swarm     | Drone    | Drone Assembly Plant | Attack drones; EMP-immune after Ghost Protocol            | Infantry, light vehicles | Anti-air                |
| Raptor VTOL           | Aircraft | Drone Assembly Plant | Multi-role missiles                                       | Vehicles, aircraft       | Anti-air                |
| Guardian Gunship      | Aircraft | Drone Assembly Plant | Heavy air support with point defence                      | Ground forces            | Anti-air in numbers     |
| Hypersonic Strike Jet | Aircraft | Drone Assembly Plant | One devastating bombing run, then rearms                  | Structures               | Anti-air, no second run |
| Patrol Boat           | Naval    | Naval Yard           | Fast patrol. _Addition_                                   | Boats, infantry on shore | Frigates                |
| Aegis Frigate         | Naval    | Naval Yard           | Missile frigate: anti-ship and anti-air. _Addition_       | Ships, aircraft          | Submarines              |

## Tech tree

```text
Command Hub ── Combat Engineer
├── Power Matrix · Supply Relay · Smart Turret · Anti-Air Matrix
├── Advanced Barracks ── Tactical Operator, Heavy Gunner
├── Vehicle Factory ── Supply Drone, Striker IFV, Recovery Vehicle
└── Cyber Operations Center (tier 2) ── power: Cyber Attack
    ├── Advanced Barracks ── Cyber Specialist
    ├── Vehicle Factory ── Panther MBT, Command APC
    ├── Drone Assembly Plant ── Recon Drone, Ghost Drone Swarm, Raptor VTOL
    ├── Advanced Armory · Sensor Array · Naval Yard ── Patrol Boat, Aegis Frigate
    └── Quantum Research Lab (tier 3)
        ├── Ghost Recon · Mobile Artillery · Guardian Gunship · Hypersonic Strike Jet
        ├── Photon Barrier Generator
        └── Satellite Strike Uplink (tier 4)
```

## Commander powers

From the original world design ([story.md](../story.md)): **global satellite strikes** and **cyber attacks**.

| Power            | Unlocked by             | Effect                                                            |
| ---------------- | ----------------------- | ----------------------------------------------------------------- |
| Satellite Scan   | Command Hub             | Reveals an area for 10 seconds                                    |
| Cyber Attack     | Cyber Operations Center | Disables enemy structures in an area for 15 seconds               |
| Satellite Strike | Satellite Strike Uplink | The superweapon: a precision orbital strike after a short warning |

## Campaign

**Ghost Protocol:** General Sarah Chen leads the Alliance's fight to protect democracy while wrestling with the moral implications of AI-driven warfare.

## Bot personality

Techs early, protects its Quantum Research Labs, harasses with drones, fights at range, and pulls damaged units back for repair.
