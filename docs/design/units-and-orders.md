# Units and orders

What units can be told to do, and what they do on their own. Every order is a sim command, validated against the issuing seat's grants ([multiplayer.md §3](multiplayer.md#3-command-permissions-and-conflicts)), and runs deterministically.

**Scope:** orders marked _(FP)_ are needed for the first playable; the rest come with the systems that need them.

## Orders

| Order                      | Default key                                    | What it does                                                                         |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| Move _(FP)_                | Right-click ground                             | Move; ignores enemies on the way                                                     |
| Attack _(FP)_              | Right-click enemy                              | Attack that target until it's dead or out of vision                                  |
| Attack-move _(FP)_         | A + click                                      | Move, engaging anything hostile on the way                                           |
| Stop _(FP)_                | S                                              | Drop all orders                                                                      |
| Hold position _(FP)_       | H                                              | Stay put; fire at anything in range, never chase                                     |
| Force fire                 | Ctrl + right-click                             | Attack a friendly unit, a structure or the ground (clear forests, splash a choke)    |
| Patrol                     | P + click                                      | Loop between waypoints, engaging on the way                                          |
| Guard / follow             | Command card (no default key)                  | Follow a unit and defend it                                                          |
| Scatter                    | X                                              | Spread out (against splash)                                                          |
| Deploy / pack up           | D                                              | Mobile structures, artillery setup, the Phoenix Initiative's relocating Command Node |
| Load / unload              | Right-click transport; U                       | Board a transport or garrison; unload all or at a point                              |
| Capture / repair / salvage | Right-click target                             | Builders, repair units, Salvage Crawlers                                             |
| Return to base / rearm     | R                                              | Aircraft go back to their pads                                                       |
| Set rally point _(FP)_     | Right-click with production structure selected | Where new units go                                                                   |

## Order model

- A unit has **one current order and a queue** of up to 32 more. A plain order replaces the current order and clears the queue; a Shift-order appends to the queue.
- **Mixed selections:** an order goes to every selected unit that can carry it out; the others ignore it (e.g. "deploy" only reaches deployable units). Context orders (right-click) are resolved per unit: the same click can mean "attack" for a tank and "repair" for a builder.
- **Co-controllers:** two orders for the same unit in the same tick are applied in server order, each following the replace-or-append rule above, so the result is deterministic and the same for everyone.
- **Produced units** inherit their factory's order queue at the moment they leave the factory.

## Queues and waypoints

- **Shift queues** any order after the current one. Queued orders show as a path of waypoint markers for the selection.
- **Editing the queue:** drag a waypoint to move it, right-click a waypoint to delete it. Dragging one waypoint of a shared patrol route updates every unit on that route.
- **Factory orders:** a production structure can hold a full queue (move, attack-move, patrol, load into a transport). Every unit it produces inherits that queue. _(FP: rally point only.)_
- **Repeat production:** a toggle on a production queue rebuilds each finished unit until cancelled or out of resources.

## Stances

| Stance                 | Behaviour                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| Aggressive _(default)_ | Engage anything in vision; chase a limited distance, then return |
| Defensive              | Engage only within weapon range plus a short leash               |
| Hold fire              | Never fire unless ordered (stealth, ambush)                      |

Hold position is an order, not a stance, so it can sit in a queue.

## Automatic behaviour

- **Target acquisition** follows the priority rules in [combat-and-balance.md](combat-and-balance.md#targeting).
- **Retaliation:** idle units on aggressive or defensive stance fire back at attackers they can hit. Units on hold fire never do.
- **Harvesters** auto-return when full and auto-seek the nearest node when theirs runs out; see [economy.md](economy.md).
- **Builders and repair units** on aggressive stance repair damaged friendly units and structures nearby.
- **Auto-cast:** abilities marked auto-castable (e.g. repair drone, the Alliance of Free Nations' Photon Barrier Generator Overcharge) can be toggled to fire on their own with a right-click on the ability button. Auto-cast state is per unit or structure.
- **Idle notification:** idle builders and idle production structures show in the HUD.

## Transports and garrisons

- **Transports** have a capacity in slots: infantry 1, light vehicle 2–3, heavy vehicle 4–5. Air transports can pick up and drop at points; naval transports land on shores. Destroyed transports kill or eject their cargo depending on the domain (air: killed; ground and naval: ejected with damage).
- **Garrisons:** marked structures (bunkers, some neutral buildings) hold infantry. Garrisoned infantry fire from inside with a range bonus and take reduced damage, and are ejected when the structure falls below 10% health.
- **Fire weapons** deal bonus damage to garrisons, through their warheads' `versus` percentages and the `fire` tag that targets can `resist` ([combat-and-balance.md](combat-and-balance.md#damage-against-armour)).

## Movement details

- **Crushing:** heavy tracked vehicles crush infantry and trees in their path (per definition).
- **Formations:** see [pathfinding.md](../engineering/pathfinding.md#group-movement).
- **Aircraft:** rotorcraft can hover anywhere; fixed-wing aircraft need pads to rearm and can't stop mid-air.
- **Naval:** the `naval` movement domain uses deep water only; `amphibious` uses land and both water depths ([accepted table](../project/decisions/2026-11-01-movement-water-table.md)). Submarines are stealthed while submerged and detected by sonar abilities.

## Non-happy paths

- **Unreachable target:** the unit goes as close as it can and shows an "unable to reach" notice.
- **Target goes into fog:** attack orders end; attack-move resumes its move.
- **Transport destroyed with queued unload orders:** cargo follows the ejection rule; their own queues are cleared.
- **Conflicting orders from two co-controllers in one tick:** resolved by server sequence; the unit's order model replaces or appends ([multiplayer.md §3](multiplayer.md#3-command-permissions-and-conflicts)).
- **Order rejected** (no grant, not enough resources, invalid placement): the HUD shows the reason; nothing happens in the sim.
