# Pathfinding and movement

Our own implementation, inside the deterministic sim (`packages/sim/src/features/movement/`).

## Navigation data

- The map compiles into one **nav grid per movement domain**: `foot`, `wheeled`, `tracked`, `hover`, `naval` and `amphibious`. Air units don't use a grid.
- Each cell stores passability and an **integer cost**, from the surface (road cheap, rubble and forest expensive or blocked per domain), occupancy (structures, blocking props), and clearance (large units need wider gaps).
- **Height levels:** cells on different levels connect only through ramp cells. Cliffs are impassable edges.
- **Connected components** are labelled per domain, so "is this reachable?" is a constant-time lookup. Orders to unreachable spots go to the nearest reachable cell.
- **Dynamic changes** (a building placed or destroyed, a bridge down, a forest cleared) update the affected cells and sectors at a tick boundary, and mark paths through them for repathing.

## Finding a path

1. **Same-sector or short paths:** A* on the 8-connected grid.
   - Integer costs: 10 orthogonal, 14 diagonal, times the cell cost.
   - Octile-distance heuristic.
   - No diagonal corner-cutting past blocked cells.
   - **Deterministic tie-breaking:** lowest f, then lowest h, then lowest cell index. The open list is a binary heap with that ordering.
2. **Long paths:** hierarchical. The map is divided into sectors (e.g. 16×16 cells) with portals between them. A* runs first on the portal graph, then refines inside each sector as the unit advances.
3. **Smoothing:** the cell path is string-pulled with grid line-of-sight checks, so units move in straight lines instead of zigzags.
4. **Large groups to one target** (later): a flow field per target is shared by all the units in the group.

## Budgets

Each Force has its own path request queue, ordered canonically by (tick issued, entity ID), with player orders ahead of automatic repaths. Each tick processes a fixed number of **node expansions**, shared **round-robin between Forces**, so one player's huge group move can't starve everyone else's units. A request that runs out continues next tick, while the unit starts moving toward the best partial result. The budget is counted in work units, never milliseconds, so results never depend on CPU speed.

## Group movement

- **Formations:** a group order computes formation slots around the destination. Units are assigned to slots deterministically (sorted by ID, then nearest slot). Right-drag sets facing and width.
- **Speed matching:** a group moving in formation travels at its slowest member's speed.
- **Local avoidance:** steering adds separation from nearby units. Neighbours are processed in entity-ID order.
- **Pushing:** idle friendly units step aside for moving ones.
- **Stuck detection:** if a unit makes no progress for N ticks, it repaths, and eventually gives up with an "unable to reach" notice.
- **Vehicles** have turn rates and can't strafe. Tracked units can turn in place; wheeled units need a turning circle.

## Air movement

- **Rotorcraft** steer directly at an altitude band and can hover.
- **Fixed-wing** aircraft fly with a minimum speed and turn radius, make attack runs, and return to base to rearm.
- Air units only avoid each other loosely; they never block ground units.

## AI use

The AI uses the same pathfinder with an extra **threat cost layer** built from what its vision has revealed (known defence ranges, recent losses), so it routes around danger. See [ai.md](ai.md).

## Tests

- Golden paths on fixture maps.
- Determinism: the same requests arriving in a different network order within one tick give identical results, because queues are sorted canonically before processing.
- Benchmarks: requests per tick at 300 units on a 256×256 map.
