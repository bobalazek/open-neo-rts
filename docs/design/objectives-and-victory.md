# Objectives, defeat and victory

Every match answers three questions: what are the players trying to do, when is a Force out, and when is the match over. All three are ruleset data, evaluated deterministically by the sim in the objectives/victory phase of the tick.

## When a Force is defeated

A Force is **eliminated** when the ruleset's elimination rule becomes true. The lobby picks one:

| Rule                 | A Force is out when…                                                           | Typical use                   |
| -------------------- | ------------------------------------------------------------------------------ | ----------------------------- |
| **Annihilation**     | It has no units and no structures left (walls, mines and similar are excluded) | Classic, default for skirmish |
| **Base destruction** | All of its structures are destroyed; leftover units don't keep it alive        | Faster matches                |
| **Headquarters**     | Its HQ (and any mobile HQ vehicles) is destroyed                               | Quick games, PvE              |
| **Capital**          | Its capital city is captured (territory rulesets)                              | Grand-strategy profiles       |

Other ways out: **surrender** (under Shared Command, following the Force's approval rule), and disconnection without a takeover after the grace timer. Defeat is announced to everyone. What the defeated player can do next (spectate, assist an ally) is in [multiplayer.md §4](multiplayer.md#4-eliminated-players-and-ally-assistance).

A **team** is defeated when all its Forces are eliminated, unless it completes an alternative victory first.

## Victory conditions

A match has one or more victory conditions; the first one met ends the match.

| Condition                 | Won when…                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Conquest**              | Every opposing team is eliminated                                                                    |
| **Territory**             | A team holds X% of the map's territory for N minutes (territory rulesets)                            |
| **Control points**        | A team holds the marked points for N minutes, or reaches a score from holding them                   |
| **Wonder**                | A team completes a wonder and defends it for N minutes                                               |
| **Score**                 | Highest score when the time limit ends                                                               |
| **Survival**              | The team survives a set number of waves or minutes against attacking bots (co-op)                    |
| **Territorial control**   | A team holds the map's strategic facilities (quantum computing sites in the 2035 game) for N minutes |
| **Economic dominance**    | A team controls 70% of the map's resource nodes for N minutes                                        |
| **Technical superiority** | A Force completes and fires every one of its faction's superweapons                                  |
| **Objectives**            | All primary objectives of a scenario or mission are completed                                        |

Timed conditions show a visible countdown to everyone, so nobody loses by surprise. Under dynamic diplomacy, who shares a win follows the policy in [multiplayer.md §5](multiplayer.md#5-diplomacy). A temporary ceasefire never shares a victory.

## Conquering

- **Structures** can be destroyed, or **captured** by engineer-type units where the ruleset allows. A captured structure changes owner and keeps working for its new Force.
- **Cities** (territory rulesets) are captured once their defences are down and a unit holds them. Ownership, territory and income transfer to the captor.
- **Regions** in the world-map campaign are conquered by winning the battle fought there. The outcome is written back to the campaign state.

## Objectives and missions

Scenarios and campaign missions use an **objective system** built from declarative triggers, authored in the scenario editor (see [map-editor.md](../engineering/map-editor.md)):

- **Primary** objectives must all be completed to win. **Secondary** objectives give rewards or score. **Hidden** objectives are revealed by triggers.
- Each objective has a condition (destroy X, capture Y, hold area Z for N minutes, escort unit, survive until tick T, build or research something) and optional failure conditions (lose unit X, timer runs out).
- **Triggers** react to sim events (area entered, unit died, tick reached, objective completed) with effects from a fixed list: spawn units, change diplomacy, reveal map, show dialogue, set objective, play camera rail. No arbitrary scripts.
- Objectives appear in the HUD's objective panel and the in-game menu; changes are announced.

## Match end

When the match ends, the sim emits a final result: winners, losers, and per-Force statistics (units built and lost, resources gathered and spent, structures destroyed, territory over time, APM). The post-match screen shows them; see [post-match.md](screens/post-match.md). The result and the replay are saved; see [saves-and-replays.md](../engineering/saves-and-replays.md).
