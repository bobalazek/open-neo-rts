# Economy

How resources flow in the base game. The resources themselves are engine code (`packages/content/src/rules/resources.ts`; see [content-and-eras.md §2](content-and-eras.md#2-resources)); faction twists are in [factions/](factions/README.md#resources).

## The loop

```text
Ore field ──harvester──► drop-off ──► credits ─────────┬──► build, research, repair
Material node ──node-bound structure──► raw materials ─┘
Wrecks ──salvage──► raw materials (+ some credits)
Power structures ──► power capacity ──► keeps everything running
```

## Starting a match

- Each faction's definition sets its start (`start` in the faction file): structures, units and resources. Every faction starts with its headquarters, two builders, one harvester and three basic infantry, plus the match's starting credits setting ([factions/](factions/README.md#starting-a-match)).
- The Phoenix Initiative starts with its Command Node packed up as a vehicle and deploys it wherever it likes ([phoenix-initiative.md](factions/phoenix-initiative.md)); every other faction starts with its headquarters placed at the spawn.
- Every spawn has at least one ore field nearby (the map validator checks this).

## Harvesting

- **Ore fields** are clusters of ore cells. Each cell holds a finite amount and **regrows slowly** up to its cap; fully mined cells regrow from neighbours. Rich fields hold more and regrow faster.
- **Harvesters** carry a fixed load (e.g. 500 credits worth), mine one cell at a time, then drive to the nearest friendly drop-off structure. When their field is empty they move to the nearest reachable field on their own.
- **Drop-off docking:** one harvester unloads at a time; others queue by arrival tick, then entity ID. The approved provisional unload duration is two seconds. Completed same-Force docks use their first authored exit with radius-aware exterior clearance. Manual orders suspend automatic hauling while preserving cargo; explicit harvest resumes it. Missing or blocked docks retain cargo and retry. Mining rates are definition data; the Supply Truck rate activation is a separate balance change.
- **Material nodes** are single spots worked by a node-bound structure until depleted ([terrain-and-biomes.md](terrain-and-biomes.md#resource-fields-and-nodes)). The [shared extractor](../project/decisions/2026-11-02-extractor-economy.md) costs 800 credits, takes 20 seconds and consumes 10 power. Provisionally it produces one material per second, or two credits per second on oil; brownout halves output and power-off stops it. Oil uses the map's finite amount when present and is otherwise unlimited. These values await balance playtests.
- **Salvage:** wrecks hold materials proportional to the destroyed unit's cost. Any faction's builders can clear a wreck for a small amount; the Phoenix Initiative's Salvage Crawlers and Scavenger VTOLs get the full value, plus salvage points ([phoenix-initiative.md](factions/phoenix-initiative.md)).

## Spending

Normal matches keep spendable stocks in one canonical ECS bank per Force:
credits, materials, industrial capacity and salvage points. Controllers share
that bank. Atomic spending checks the feature's grant at the current tick and
preflights the full cost; insufficient funds or invalid/overflowing values change
nothing. Power and quantum-processing capacity are not spendable bank stocks.
Income/refund helpers are authoritative engine operations, not player commands
that mint resources. The owning construction/production lifecycle must ensure a
paid item is refunded only once. Seat snapshots copy only economically permitted
banks; other Forces' balances remain private.

- Costs are paid **when production or construction starts**, not reserved earlier. Immediate construction payments follow canonical command order during ingest. Free production enqueueing does not reserve funds: eligible queued starts pay later in the economy phase, in enqueue order across producers. Only affordable work starts ([multiplayer.md §8](multiplayer.md#8-adversarial-and-acceptance-tests)).
- **Cancel** refunds 100% of what was paid. **Sell** refunds 50% of a structure's cost. Repair costs credits over time and pauses when broke.
- **Low funds:** production pauses (not cancels) and resumes when credits arrive.

## Production and construction queues

- **Units:** production structures train one unit at a time, except the Barracks Complex's two active slots ([owner decision](../project/decisions/2026-11-02-production-slots.md)). The queue limit stays five items. Several structures of the same kind build independently; there is no speed bonus for owning more beyond that. Each slot pays when its unit **starts** building, not when queued.
- **Structures:** builders construct them on site, and more builders build faster ([structures.md](structures.md#construction-and-builders)). Shift-placing queues several sites for the same builders.
- **Cancel:** an item that hasn't started costs nothing to remove. Cancelling an item in progress refunds 100%.
- **Destroyed mid-build:** if a production structure dies, its in-progress unit is refunded in full and the rest of the queue is dropped. A destroyed construction site loses what was spent on it ([structures.md](structures.md#construction-and-builders)).
- **Low funds:** the next item waits at the head of the queue until it's affordable. Nothing is cancelled automatically.

## Power

- Every structure has a power value (+ produced, − used). The resource bar shows used / produced.
- **Brownout** when used > produced: production and research run at 50%, powered defences go offline, radar is disabled. Selling or losing a power plant can trigger it mid-fight.
- Structures can be **powered down** manually to free power for others.

Normal matches implement this with ECS power amounts and enable flags. Only
completed, enabled structures contribute supply or draw. Turning a producer off
also removes its supply. Completion, destruction, ownership changes and toggles
affect totals immediately. The `economy.power` command requires current build
permission and a private entity handle at the worker boundary. Projected power
totals and per-structure states follow the same economic visibility policy as
stock banks. Operational helpers expose 0 for disabled/incomplete production,
500 per-mille during brownout and 1,000 normally; powered consumers go offline
in brownout while positive producers remain online. Production, research,
defense and radar systems consume those helpers when implemented.

## Sharing, trading and markets

**Shared Command** means one Force and one bank: every controller with `economy.*` grants spends from it. Separate Forces never share a bank; they trade.

### Sending resources to an ally

The lobby's **transfer mode** decides how resources move between allied Forces:

| Mode                                 | How it works                                                                                                                                                                                           | Feel                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **Instant** (default for team games) | Pick an ally and an amount in the team panel; it arrives immediately, minus a 10% transfer fee (a setting, 0–50%)                                                                                      | Simple co-op                                    |
| **Convoy**                           | The resources leave on a supply vehicle (the faction's harvester carrying a crate) that drives to the ally's drop-off. It can be attacked; if destroyed, the cargo drops as a crate anyone can pick up | Tactical: escort your convoys, raid the enemy's |
| **Off**                              | No transfers (competitive 1v1, or until diplomacy allows it in free-for-all)                                                                                                                           |                                                 |

- Every transfer is a command with the sender's grants checked, so it appears in replays.
- Transfers of credits and raw materials are allowed. Faction-unique resources (quantum processing, industrial capacity, salvage points) can't be transferred.
- In free-for-all with diplomacy, a **trade treaty** enables transfers between the two Forces ([multiplayer.md §5](multiplayer.md#5-diplomacy)).

### Exchange markets

Some structures exchange one resource for another: the Phoenix Initiative's Black Market Hub, and capturable neutral **trading posts** on some maps.

- A market lists exchange pairs (credits ↔ raw materials, salvage points → credits) with a base rate.
- **Rates move with use:** every trade worsens that direction's rate by a few percent, recovering slowly over time. Everyone uses the same deterministic rate, so dumping resources has a cost.
- Market trades are commands, so they're validated, logged and replayed like everything else.

## Pacing targets (for balance)

| Moment                       | Target                                    |
| ---------------------------- | ----------------------------------------- |
| Starting credits (standard)  | 5,000                                     |
| One harvester's income       | ~300 credits per minute on a normal field |
| Typical income at 10 minutes | 2,000–3,000 credits per minute            |
| First tier-2 structure       | ~4–5 minutes                              |
| A standard 1v1               | 15–25 minutes                             |

These are design targets checked by AI-vs-AI runs ([combat-and-balance.md](combat-and-balance.md#balancing)), not hard-coded values.

## Non-happy paths

- **No drop-off structure left:** harvesters wait at their last field; the HUD warns.
- **All fields depleted:** income falls to salvage and nodes only; long games shift to a tighter economy by design.
- **Ally leaves:** their Force's bank stays with the Force (bot takeover or remaining co-controllers); nothing is redistributed automatically.
