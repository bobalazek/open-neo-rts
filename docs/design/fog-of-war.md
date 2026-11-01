# Fog of war

Fog of war is both a game rule and a security boundary: a client never receives what its player can't see.

## Rules

Each **vision group** has its own view of the map. A vision group is a Force, plus whoever shares vision with it: teammates by default, treaty partners, the extra controllers of a Shared Command Force, and allowed spectators.

| Cell state              | Shows                                                           |
| ----------------------- | --------------------------------------------------------------- |
| **Unexplored** (shroud) | Nothing: solid dark                                             |
| **Explored** (fog)      | Terrain, plus the last-seen state of enemy structures as ghosts |
| **Visible**             | Everything currently in vision                                  |

- **Vision sources:** every unit and structure has a vision radius in cells. Some (radar, scouts, towers) see further or reveal areas temporarily.
- **Height levels:** units on higher ground see lower levels; units below can't see up a cliff until they climb or get spotted. The terrain is built from discrete height levels, so this rule is easy to read.
- **Line of sight:** tall structures block vision behind them; smoke abilities block it temporarily. Which blockers apply is a ruleset setting.
- **Fog memory:** enemy structures stay visible as **ghosts** in their last-seen state until re-observed. A ghost of a destroyed structure remains until someone sees the empty spot. Units are never remembered; they vanish when they leave vision.
- **Stealth and detection:** stealthed entities are invisible unless inside a detector's range. Firing reveals the shooter briefly.
- **Lobby options:** standard fog, explored map (no shroud), or no fog.
- **Minimap and alerts** follow the same rules. Under-attack alerts point at your own units being hit, never at the unseen attacker.

## How it works

- The sim owns a **vision grid** per vision group: a coarse integer grid updated in the fog phase of the tick. Line of sight uses deterministic integer raycasts over the height levels.
- Updates are incremental: only sources that moved, appeared or died re-stamp their cells.
- **Visibility projection** builds each seat's view from that grid: visible entities, ghost records and the seat's own fog grid. This is the only thing sent to a client. See [multiplayer.md](multiplayer.md).
- **Single player uses the same path.** The sim runs in a Web Worker and the renderer only receives the projection, so fog bugs show up offline, not first in multiplayer.
- **AI** observes through the same projection as a human.
- **Rendering:** the client turns its fog grid into a texture that the terrain and unit shaders sample, with soft edges from upsampling. Ghosts render desaturated. Unexplored cells are solid dark.
- **Tests:** fog-leak tests assert that no snapshot, delta, event, replay or reconnect ever contains an entity outside the seat's vision. See [testing.md](../engineering/testing.md).
