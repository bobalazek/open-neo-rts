# Economy

How resources flow in neo-2035. Resource kinds and other profiles' economies are in [content-and-eras.md §2](content-and-eras.md#2-resource-model-no-hardcoded-four-resource-economy); faction twists are in [factions/](factions/README.md#resources).

## The loop

```text
Ore field ──harvester──► Refinery ──► credits ──► build, research, repair
Rare-metal node ─────────► materials ─┘
Wrecks ──salvage──► materials (+ some credits)
Power structures ──► power capacity ──► keeps everything running
```

## Harvesting

- **Ore fields** are clusters of ore cells. Each cell holds a finite amount and **regrows slowly** (per profile) up to its cap; fully mined cells regrow from neighbours. Rich fields hold more and regrow faster.
- **Harvesters** carry a fixed load (e.g. 500 credits worth), mine one cell at a time, then drive to the nearest friendly refinery. When their field is empty they move to the nearest reachable field on their own.
- **Refinery docking:** one harvester unloads at a time; others queue in arrival order (deterministic). Unloading takes a few seconds.
- **Rare-metal nodes** are single points worked by a derrick-type structure built on top, producing materials at a fixed rate until depleted.
- **Salvage:** wrecks hold materials proportional to the destroyed unit's cost. Any faction's engineers can clear a wreck for a small amount; PI Salvage Crawlers get the full value ([pi.md](factions/pi.md)).

## Spending

- Costs are paid **when production or construction starts**, not reserved earlier. If two co-controllers spend in the same tick, the server order decides, and only what's affordable goes through ([multiplayer.md §8](multiplayer.md#8-adversarial-and-acceptance-tests)).
- **Cancel** refunds 100% of what was paid. **Sell** refunds 50% of a structure's cost. Repair costs credits over time and pauses when broke.
- **Low funds:** production pauses (not cancels) and resumes when credits arrive.

## Power

- Every structure has a power value (+ produced, − used). The resource bar shows used / produced.
- **Brownout** when used > produced: production and research run at 50%, powered defences go offline, radar is disabled. Selling or losing a power plant can trigger it mid-fight.
- Structures can be **powered down** manually to free power for others.

## Sharing between allies

- **Resource transfers:** send credits or materials to an ally (ruleset option; default allowed in team games, off in FFA until a treaty allows it).
- **Shared Command:** one Force means one bank; every controller with `economy.*` grants spends from it.
- **Teams never share a bank** unless the preset puts everyone in one Force.

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

- **No refinery left:** harvesters wait at their last field; the HUD warns.
- **All fields depleted:** income falls to salvage and derricks only; long games shift to a tighter economy by design.
- **Ally leaves:** their Force's bank stays with the Force (bot takeover or remaining co-controllers); nothing is redistributed automatically.
