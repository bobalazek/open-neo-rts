# Game modes, defeat and victory

Every match answers three questions: what are the players trying to do, when is a Force out, and when is the match over. The lobby picks a **game mode**; the sim evaluates it deterministically every tick.

## Game modes

| Mode                      | Win by                                                                           | Notes                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Last Man Standing**     | Eliminating every opposing team                                                  | The default skirmish and multiplayer mode                                                                                  |
| **Wonder Race**           | Being the first team to complete a wonder and keep it standing for the countdown | Eliminating every opponent still wins too. See [Wonders](#wonders)                                                         |
| **Territorial Control**   | Holding the map's quantum computing facilities for a set time                    | Facilities are neutral structures captured by builders; the map places them                                                |
| **Economic Dominance**    | Controlling 70% of the map's resource nodes for a set time                       | A node counts while you own the structure on it ([terrain-and-biomes.md](terrain-and-biomes.md#resource-fields-and-nodes)) |
| **Technical Superiority** | Researching every tier-4 technology of your faction and firing your superweapon  | Superweapons must be enabled                                                                                               |
| **Score**                 | Highest score when the time limit ends                                           | Score counts destruction, economy and objectives                                                                           |
| **Survival**              | Surviving a set number of waves against attacking bots                           | Co-op against bots                                                                                                         |
| **Mission**               | Completing a campaign or scenario's primary objectives                           | Campaigns and custom scenarios                                                                                             |

- In every mode except Survival and Mission, eliminating all opponents also wins.
- Timed goals show a countdown to every player, and are announced when a team starts one, so nobody loses by surprise.
- The map limits the choice: Territorial Control needs facilities on the map, and Economic Dominance needs enough resource nodes. The lobby only offers modes the map supports.
- Under dynamic diplomacy, who shares a win follows [multiplayer.md §5](multiplayer.md#5-diplomacy). A temporary ceasefire never shares a victory.

## Wonders

The **Wonder Race** mode is about one structure: the **Quantum Nexus**, a massive quantum computer that every faction can build ([structures.md](structures.md#wonders)).

- **One wonder per team.** Any player on the team can place the wonder site; the cost (credits and raw materials) is paid by the player who places it, and teammates can send resources to help.
- **Everyone's builders help.** Every builder on the team can work on the site: the Alliance's Combat Engineers, the Collective's Field Technicians and the Phoenix Initiative's Nanite Constructors side by side. More builders mean faster progress, with diminishing returns per builder.
- **It's loud.** Starting a wonder is announced to all players, its location is revealed, and its progress shows in every player's top bar. Everyone knows where to attack.
- **Destroying the site** resets that team's progress. The team may start again elsewhere.
- **Finishing it** starts a 3-minute countdown (a setting). If the wonder survives, the team wins. If it's destroyed during the countdown, the race continues.
- **Ties:** if two teams finish in the same tick, the countdown runs for both; the first wonder to survive its countdown wins.

## When a Force is defeated

A Force is **eliminated** when the lobby's elimination rule becomes true:

| Rule                 | A Force is out when…                                                    | Typical use    |
| -------------------- | ----------------------------------------------------------------------- | -------------- |
| **Annihilation**     | It has no units and no structures left (walls and similar are excluded) | Default        |
| **Base destruction** | All of its structures are destroyed; leftover units don't keep it alive | Faster matches |
| **Headquarters**     | Its headquarters (and any packed-up mobile headquarters) is destroyed   | Quick games    |

Other ways out: **surrender** (under Shared Command, following the Force's approval rule), and leaving or disconnecting per the [leave and disconnect policy](match-rules.md#leaving-and-disconnecting). Defeat is announced to everyone. What the defeated player can do next (spectate, help an ally) is in [multiplayer.md §4](multiplayer.md#4-eliminated-players-and-ally-assistance).

A **team** is defeated when all its Forces are eliminated, unless it wins another way first.

## Capturing

- **Structures** can be destroyed, or **captured by builders** where the rules allow. A captured structure changes owner and keeps working for the new Force.
- **Neutral objectives** (quantum computing facilities, structures on resource nodes, tech buildings) are captured the same way and count towards Territorial Control and Economic Dominance ([neutrals-and-map-objects.md](neutrals-and-map-objects.md)).

## Missions and objectives

Campaign missions and scenarios use an **objective system** built from declarative triggers, authored in the scenario editor ([map-editor.md](../engineering/map-editor.md)):

- **Primary** objectives must all be completed to win. **Secondary** objectives give rewards or score. **Hidden** objectives are revealed by triggers.
- Each objective has a condition (destroy X, capture Y, hold area Z for N minutes, escort a unit, survive until a time, build or research something) and optional failure conditions (lose unit X, a timer runs out).
- **Triggers** react to sim events (area entered, unit died, time reached, objective completed) with effects from a fixed list: spawn units, change diplomacy, reveal the map, show dialogue, set objectives, play a camera path. No scripts.
- Objectives appear in the HUD's objective panel and the in-game menu; changes are announced.

## Match end

When the match ends, the sim emits the result: winners, losers, how it was won, and per-Force statistics (units built and lost, resources gathered and spent, structures destroyed, territory over time, APM). The [post-match screen](screens/post-match.md) shows them, and the result and replay are saved ([saves-and-replays.md](../engineering/saves-and-replays.md)).
