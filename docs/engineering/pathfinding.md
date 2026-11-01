# Pathfinding and movement

Our own implementation, inside the deterministic sim (`packages/sim/src/features/movement/`).

## Phase 1b progress

The standalone `PathSearch` core accepts a caller-supplied `NavGrid`: row-major integer entry costs
(zero blocks a cell) and outgoing neighbour connection bits in `NAV_DIRECTIONS` order. Dimensions
are 1–512 cells per axis, matching the map limit. The standalone `compileNavigation` compiler now
implements the [accepted water table](../project/decisions/2026-11-01-movement-water-table.md).

Each request owns its search arrays and heap. Keep its supplied grid unchanged until completion.
`step(budget)` expands at most that many nodes and returns a path including the start. Partial and
unreachable results choose the reachable cell with lowest octile distance to the target, then lowest
path cost, then lowest cell index. A blocked start is invalid; a blocked goal uses that fallback.
Diagonal moves require both orthogonal routes around the corner, including their edge connections,
to be passable. Costs stay exact integers even at the largest grid and cell cost.

`labelReachability` labels reciprocal compiled grids with the search's exact edge/corner rules.
`nearestReachable` resolves blocked, disconnected or off-map target cell coordinates within the start's
component, using octile distance then row-major cell index. A blocked start has no destination. Labels
and fallback scans are bounded by the grid size; ordinary same-component targets use constant time.
Map matches now register ground path following and bounded direct air movement. Mapless kernel tests
retain the phase-1a flat movement helper. Map units require their original domain and integer radius
at setup/replay validation. `toDefinition` projects owner-authored `movement.domain`, `radius` and prop
`domains` once; no roster-specific movement rule is introduced.

The match shares a 4,096-expansion quota across all Forces, domains and radii through one scheduler.
Swept circular segment checks string-pull paths against exact static rectangles, cliff edges and map
bounds; unobstructed orders can follow the resulting direct segment immediately. Partial results can
move while A* continues. Routes, targets, search progress and the next-Force cursor participate in
canonical hashing. Search hashing reads sparse discovered nodes directly, without allocating or
JSON-encoding whole A* arrays at each debug publication. Explicit `movement.snapshot()` remains
available for diagnostics; replay remains the supported restore path in phase 1.

## Navigation data

- The map compiles into one **nav grid per movement domain**. The domains are a fixed list used everywhere (content `movement.domain`, map masks, overlays): `foot`, `wheeled`, `tracked`, `hover`, `amphibious`, `naval` and `air`. Air units don't use a grid.
- Each cell stores passability and an **integer cost**, from the surface (road cheap, rubble expensive), occupancy (structures, blocking props), and clearance (large units need wider gaps). Trees use their original prop block/domain fields; there is no forest surface or forest cost in the compiler.
- **Height levels:** cells on different levels connect only through ramp cells. Cliffs are impassable edges.
- **Connected components** are labelled per domain, so "is this reachable?" is a constant-time lookup. Orders to unreachable spots go to the nearest reachable cell.
- **Dynamic changes** (a building placed or destroyed, a bridge down, a forest cleared) update the affected cells and sectors at a tick boundary, and mark paths through them for repathing.

### Standalone compiler (1B-19)

`compileNavigation(map, definitions, { domain, radiusSubcells }, liveObjects?)` accepts the resolved
`MatchMap`, original content projected to `NavigationDefinition` (`id`, `footprint`, `blocks`, `domains`),
and one explicit ground domain/radius. It returns a caller-owned `NavigationGrid`, compatible with
`PathSearch`, plus cell-centre `clearanceSubcells` and physical `speedPercent`. Inputs are validated;
the compiler never reads or changes the world. `liveObjects` adds static blockers to `map.objects` using
the same NW anchor, subcell positions and degree rotations. Units and resource fields do not block routes.
To remove an authored blocker, supply a map snapshot whose objects reflect its removal. No invalidation,
scheduler integration or persistent definition/state fields are introduced here.

Clearance uses circular radii in integer subcells (0–8,192, the original content limit). It measures exact
squared distance to blocked cell rectangles, discontinuous ramp/cliff edges and the map boundary, then
rounds the reported distance down with integer square root. Touching a boundary is allowed; overlapping
it is blocked. Clearance is capped at 8,192. Cardinal connections also check the entire swept segment
between cell centres. Diagonals reuse the search's shared rule requiring both orthogonal routes, including
their swept clearance and edge connections. A ramp edge connects only when both endpoints of the shared
edge match the neighbouring plane, so parallel ramps join and raised ramp sides do not connect to flat cells.

**Addition — first-pass engineering route weights:** road 1, ordinary surfaces 2, rubble 3, for every
ground domain. Wheeled shallow-water entry doubles that surface weight. These are route preferences,
not approved final terrain balance. Physical speed is a separate 100% layer except wheeled shallow water
at the owner's 50%; blocked cells carry 0%. No other physical speed modifier is chosen here.
The use of terrain-specific locomotor costs follows [OpenRA's locomotor terrain entries](https://docs.openra.net/en/release/traits/#locomotor);
radius-based obstruction clearance follows the approach described in [0 A.D.'s pathfinder design](https://svn.wildfiregames.com/nightly-build/trunk/docs/pathfinder.pdf).
Those sources support the engineering separation, not these numerical balance values.

## Finding a path

1. **Same-sector or short paths:** A* on the 8-connected grid.
   - Integer costs: 10 orthogonal, 14 diagonal, times the cell cost.
   - Octile-distance heuristic scaled by the grid's minimum positive entry cost.
   - No diagonal corner-cutting past blocked cells.
   - **Deterministic tie-breaking:** lowest f, then lowest h, then lowest cell index. The open list is a binary heap with that ordering.
2. **Long paths:** hierarchical. The map is divided into sectors (e.g. 16×16 cells) with portals between them. A* runs first on the portal graph, then refines inside each sector as the unit advances.
3. **Smoothing:** the cell path is string-pulled with grid line-of-sight checks, so units move in straight lines instead of zigzags.
4. **Large groups to one target** (later): a flow field per target is shared by all the units in the group.

## Budgets

Each Force has its own path request queue, ordered canonically by (tick issued, entity ID), with player orders ahead of automatic repaths. Each tick processes a fixed number of **node expansions**, shared **round-robin between Forces**, so one player's huge group move can't starve everyone else's units. A request that runs out continues next tick, while the unit starts moving toward the best partial result. The budget is counted in work units, never milliseconds, so results never depend on CPU speed.

The standalone `PathScheduler` implements this quota over one caller-supplied `NavGrid`. Submit each tick's requests before calling `tick()`; resolve multiple commands for the same entity in canonical command order first. `submit()` replaces prior work for that entity, including after a Force transfer; `cancel()` removes it for stop/death/removal. A new player order can preempt an automatic repath while retaining that repath's search. The next Force cursor persists across ticks, including when the quota is smaller than the number of Forces. Results contain a partial/final path once per served request, and integer expansion/completion/queue counters per tick and Force. A zero quota performs no work.

`snapshot()` emits canonical JSON-compatible state: sorted Force IDs and queues, the next Force cursor, the fixed quota, and the cost/parent/closed arrays and exact heap order of every active A* search. `restore()` resumes against the **same immutable grid**, or the same request-to-grid resolver. Grids stay caller-owned and are not included in scheduler state. Map matches hash the scheduler's full continuation state directly. Tick-boundary occupancy invalidation remains a separate task. Simulation version 4 introduces map path following; older replays fail explicitly.

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
