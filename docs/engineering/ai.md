# AI players

**Status:** proposed. Rules from the spec kit (multiplayer §7, architecture §5) are binding; the structure below is a starting design to validate with the first bot.

## 1. Ground rules

- **A bot is a seat.** It produces the same commands as a human, through the same validation and permission grants. It never writes ECS state directly.
- **Same information as a human.** Bots see only what their Force's vision allows, through a read-only observation API. A cheating difficulty must be explicitly selected and labelled in the lobby.
- **Difficulty changes decision quality, not rules.** Reaction delay, scouting, build-order quality, micro and target selection vary. Free resources or vision only exist in labelled cheating difficulties.
- **Deterministic.** The AI runs inside the authoritative sim, in the "AI decisions for next tick" phase. Its commands apply on the **next** tick. It uses its own seeded PRNG stream and fixed iteration order, so replays and AI-vs-AI runs reproduce exactly.
- **Budgets are counted, not timed.** Per-tick limits are expressed in work units (path expansions, evaluated options), never milliseconds. A wall-clock budget would make results depend on CPU speed. Wall-clock time is only measured for profiling.
- **Ours.** No third-party AI or pathfinding libraries; see [architecture.md](architecture.md#build-vs-use).

## 2. Structure

Layers run at different rates, and higher layers set goals for lower ones:

| Layer       | Rate (draft)                 | Decides                                                                         |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Strategic   | every ~2 s                   | Posture (expand, tech, attack, defend), era/tech choices, diplomacy stance      |
| Operational | every ~0.5 s                 | Economy and build orders, production mix, army groups, attack targets, scouting |
| Tactical    | every tick for engaged units | Focus fire, retreat at low health, kiting, ability use, formations              |

Decisions use **utility scoring**: options scored from observed state and picked by highest score, with seeded tie-breaking. This is easy to tune and debug. Behaviour trees can be added for scripted scenario actors if needed.

`packages/ai/src/features/`: `economy/`, `expansion/`, `production/`, `combat/`, `scouting/`, `diplomacy/`, `path-planning/`. Each feature reads observations and emits commands. Like everything else, they're added when needed.

Faction and personality differences (aggressive, turtle, tech-rush) are **content data**: weights and build orders in the pack, not code branches.

## 3. Roles bots play

| Situation                       | Behaviour                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Skirmish opponent               | Full bot controlling its own Force                                                                                |
| AI teammate (Hybrid preset)     | Separate allied Force; follows team pings and objectives                                                          |
| Co-controller of a shared Force | A bot holds a scoped grant (e.g. `economy.build` + `production.queue`) while humans run the army.                 |
| Disconnect takeover             | Takes over a seat at a canonical tick after the grace timer; hands back at a tick boundary when the human returns |
| Survival / PvE waves            | Scenario-driven attackers; scripted spawns plus tactical layer                                                    |
| Diplomacy (FFA)                 | Proposes and evaluates treaties from a utility model; must not exploit victory-rule loopholes                     |
| Balancing                       | AI-vs-AI runs across seeds (`bun neo ai-vs-ai`); see [testing.md](testing.md)                                     |

## 4. Debugging

- A debug overlay in `render` shows each bot's current posture, goals, top-scored options and chosen commands.
- `bun neo run --ai-log` dumps the AI decision log per tick, alongside the sim event log, to find why a bot did something.

## 5. First bot (first playable)

Plays the mirrored test faction: fixed build order, harvests, builds a few combat units, attacks in waves, retreats damaged units. Good enough to make skirmish testable, and to start AI-vs-AI determinism runs.
