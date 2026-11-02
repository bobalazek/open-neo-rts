# Structures

How every building works: construction by builders, placement, what clicking one shows, rally points, power, upgrades, abilities, defences, walls, superweapons and wonders. Each faction's structures are listed in its faction doc ([factions/](factions/README.md)).

**Phase:** placement, production, rally points, power, sell and repair in phase 2. Upgrades, abilities, garrisons, capture and shore structures in phase 3–4. Superweapons in phase 4.

## Roles

Every structure has exactly one `role`. Roles are engine code (`packages/content/src/rules/roles.ts`): behaviour that depends on a role keys off it, never off names.

| Role           | Does                                                                                                                | Examples (Alliance of Free Nations unless noted)                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `headquarters` | Trains builders; the base's anchor; counts for the headquarters elimination rule. The Phoenix Initiative's can move | Command Hub                                                                  |
| `power`        | Produces power that other structures use                                                                            | Power Matrix                                                                 |
| `dropoff`      | Harvesters unload here                                                                                              | Supply Relay                                                                 |
| `production`   | Trains or builds units: infantry, vehicles, aircraft, ships                                                         | Advanced Barracks, Vehicle Factory                                           |
| `research`     | Unlocks tiers; researches upgrades                                                                                  | Quantum Research Lab, Advanced Armory                                        |
| `support`      | Radar, detection, healing, repair, buffs                                                                            | Sensor Array, Cyber Operations Center                                        |
| `defense`      | Turrets, anti-air, shields                                                                                          | Smart Turret, Anti-Air Matrix, Photon Barrier Generator                      |
| `wall`         | Walls and gates, placed by dragging                                                                                 | The Eastern Collective's Fortress Wall, the Phoenix Initiative's Nanite Wall |
| `superweapon`  | One per Force; announced to every player                                                                            | Satellite Strike Uplink                                                      |
| `wonder`       | Wins the Wonder Race mode                                                                                           | (shared by every faction; see below)                                         |

## Construction and builders

Structures are built **on site by builder units**: the Alliance's Combat Engineer, the Collective's Field Technician, the Phoenix Initiative's Nanite Constructor. The headquarters trains builders.

1. Select builders and pick a structure from the build panel. Previewing spends nothing.
2. Place it on the grid (see Placement). Once placement and clearance succeed, pay the full cost atomically and create the **construction site**, shown as a brick outline.
3. The builders walk there and build. Progress shows on the site and in the selection panel; the model assembles brick by brick.
4. **More builders build faster**, with diminishing returns: the first builder contributes 100%, the second adds 75%, the third 50%, and the fourth and every later builder each add 25% ([accepted rule](../project/decisions/2026-11-02-builder-assistance.md)). Builders can be pulled off and the site waits, half-built, until someone continues.
5. A finished structure starts working immediately.

- **Cancel** an unfinished construction site to refund 100% of its paid cost, once.
- A construction site can be attacked; if it's destroyed, the money is lost.
- Builders also **repair** (costs credits over time) and **capture** enemy and neutral structures.
- **Allied builders** can help build each other's structures when the lobby allows it, and always can on a team's wonder.

## Placement

Structures snap to the map grid. Free-form placement doesn't exist.

- **Footprint:** every structure is W×D cells and can be rotated in 90° steps. Each footprint cell has a **cell rule**:
  - `land`: dry land, not a ramp, on a buildable surface (every surface except rubble);
  - `water`: deep water;
  - `shore`: land by the same rules, or shallow water;
  - `node`: a resource node of the structure's kind. Node-bound structures (an oil derrick on an oil well) can be placed nowhere else ([terrain-and-biomes.md](terrain-and-biomes.md#resource-fields-and-nodes)).
- **Every footprint cell** is on the same height level, so nothing straddles a cliff, and the whole footprint stays out of the map's 4-cell edge margin.
- **Rotation:** at 0 the footprint's first row is at the back and the front faces south; each step turns it a quarter clockwise, as seen from above with north up.
- **Shore structures** (shipyards, naval docks, sea walls) mix rules. A shipyard is 4×4 with the back row `land`, two middle rows `shore` and the front row `water`, so it sits half on the beach, half in the sea, and launches ships into deep water. Two `shore` rows fit both one- and two-cell shallow bands. The placement grid shows each cell's rule: green where it's satisfied, red with the reason where it isn't.
- **Build radius:** every new footprint-cell center must be within six cells of a footprint-cell center of a completed same-Force structure; defenses and walls use three cells. Incomplete sites and extractors provide no radius. Remote node extractors are exempt. The starting headquarters needs no prior radius; missing paid recovery recipes remain unavailable. In territory rulesets, own territory replaces the radius. See the [accepted normal-construction contract](../project/decisions/2026-11-02-normal-construction.md).
- **Clearance:** ask only controllable friendly units to leave the footprint in stable-ID order through normal pathfinding. Wait up to 40 ticks, then refuse if still blocked. Enemy or uncontrolled blockers refuse placement; cancellation/refusal never overwrites newer orders. Revalidate before site creation and payment. Debug spawning refuses occupied cells immediately.
- **Exits and docks:** production structures have an exit cell (`socket_exit`) that must not be blocked; drop-off structures and pads have docking cells (`socket_dock`). Both are part of the footprint and shown while placing.
- **Placing** creates a construction site that builders then work on (see Construction and builders). Shift-placing queues several sites for the same builders.

## Clicking a structure: the info panel

Selecting a structure fills the **selection panel** (bottom centre of the HUD, the same place unit details appear) and the **command card** (between the selection panel and the build panel; see [HUD zones](ui-style.md#hud-zones)). See [match-hud.md](screens/match-hud.md).

```text
┌ SELECTION ──────────────────────────────────┐ ┌ COMMANDS ──────────┐
│ [portrait] VEHICLE FACTORY        Tier 1     │ │ [Rally ] [Repair ] │
│ ████████████████░░░  1,640 / 2,000           │ │ [Power ] [Sell   ] │
│ ⚡ −30 power   ★ adjacency +15% (Power Mtx)  │ │ [Upgr.1] [Upgr.2 ] │
│ Producing: Panther ▓▓▓▓▓░░░ 62%  [+2 queued] │ │ [Abil. ] [       ] │
│ Rally: ⚑ (shown on map)   Garrison: —        │ └────────────────────┘
└──────────────────────────────────────────────┘
```

- **Always:** name, portrait, tier, health, power use or output, active adjacency bonuses and their sources.
- **Production structures:** current item with progress, queue, and the rally point. The **build panel** (bottom right) switches to this structure's production tab.
- **Defences:** weapon, range (also drawn as a circle on the map), current target, powered or not.
- **Research structures:** current research, queue, available upgrades.
- **Garrisonable structures:** slots, occupants (click one to eject it).
- **Command card buttons**, in fixed positions so hotkeys stay the same:
  - set rally point;
  - repair on/off;
  - power on/off (to free power for others);
  - sell;
  - each upgrade the structure offers;
  - each ability it has.
- **Several structures of one type selected:** one shared panel (combined queue counts), and production orders spread across them.
- **Enemy or allied structure:** the same panel, read-only, showing only what your vision allows (no queue for enemies).

## Rally points

- With a production structure selected, **right-click the map** to set its rally point: a flag at the target and a line from the exit, shown while the structure is selected.
- Right-click a **unit** to rally to it: new units follow and guard it. Right-click a **transport** to make new units board it.
- **Shift + right-click** adds waypoints: a full order queue that every new unit inherits ([units-and-orders.md](units-and-orders.md#queues-and-waypoints)).
- Harvesters produced at a factory ignore combat rally points and go to the nearest resource field, unless rallied onto a field directly.
- Rally points are per structure, and part of the sim state (so co-controllers and replays see them).

## Power

Every structure has a power value (+ produced, − used). Below supply, **brownout**: production and research run at 50%, powered defences go offline, radar goes dark ([economy.md](economy.md#power)). The power toggle on the command card turns a structure off to save power; it shows a power-off icon above the building.

## Upgrades and abilities

- **Structure upgrades** are researched at the structure itself: an extra production slot, armour plating, longer turret range, faster research. They appear as command card buttons with cost and time, and as small attachments on the model once done.
- **Abilities** are activated from the command card (e.g. the Alliance's Photon Barrier Generator overcharge, the Collective's Rally Broadcast). They use the same ability definitions as units: typed effects, cooldowns, optional auto-cast.

## Defences

- Defences use weapons like units do, with the same targeting rules and stances. Many need power.
- **Walls** are placed by dragging a line; corners and gates fit automatically. Gates open for own and allied units. Walls block movement, and projectiles whose `blockedBy` includes `structures`; `arc`, `grenade` and `dropped` projectiles pass over them ([combat-and-balance.md](combat-and-balance.md#projectile-how-the-shot-travels)).
- **Detection** structures (sensor arrays, radar) reveal stealthed units in their radius.

## Superweapons

- One superweapon per Force (a setting can disable them). Building one is **announced to every player**, with its location revealed briefly.
- It charges on a visible timer that every player can see (in the HUD's top bar). When it's ready, the owner targets it like an ability. The target area gets a few seconds of warning, with visual and audio cues, before impact.
- Destroying the structure cancels the charge. Superweapons count towards the Technical Superiority victory ([objectives-and-victory.md](objectives-and-victory.md)).

## Wonders

A wonder is a huge structure that wins the match in the **Wonder Race** mode ([objectives-and-victory.md](objectives-and-victory.md#wonders)). Every faction can build the same wonder, the **Quantum Nexus**, a massive quantum computer: the prize the whole war is fought over ([story.md](story.md)).

- Only available when the lobby's victory mode includes wonders. One wonder site per team at a time.
- It's expensive (credits and raw materials) and slow: several minutes even with many builders.
- **Every builder on the team can work on it**, including allies' builders, and more builders mean faster progress. That makes it a team effort: one player can defend while another feeds builders in.
- Starting a wonder is **announced to every player**, and its location is revealed to everyone. Its progress shows in every player's top bar.
- If the site is destroyed, progress is lost. A finished wonder must survive a short countdown to win.

## Damage, capture and destruction

- **Damage states** at 66% and 33% health: missing bricks, smoke, fire ([rendering.md](../engineering/rendering.md#construction-and-destruction)).
- **Repair** costs credits over time; several builders or repair units speed it up.
- **Capture:** builders capture enemy or neutral structures where the rules allow. The structure keeps working for the new owner; its production queue is cancelled and refunded to the old owner.
- **Destruction** leaves rubble, which blocks the footprint until cleared or decayed. Garrisoned infantry are ejected; units in production are refunded to the owner.

## Non-happy paths

- **Placement blocked** (a unit walks in): placement waits, then fails with a reason, and no construction site is created.
- **Rally point unreachable** for a domain (an aircraft factory rallying into a building): each unit goes as close as it can.
- **Selling a structure with units in its queue:** queued items are refunded, then the sale completes.
- **Brownout during a superweapon charge:** the charge pauses until power returns.
