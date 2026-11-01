# Terrain, maps and biomes

The 3D world is built from bricks, in the same visual language as the units. Terrain rules feed pathing ([pathfinding.md](../engineering/pathfinding.md)), vision ([fog-of-war.md](fog-of-war.md)) and combat ([combat-and-balance.md](combat-and-balance.md)).

## Shape of the world

- **Grid:** the map is a grid of cells (2 m per cell). Structures, props and resource nodes align to it. Typical sizes: small 96×96 (1v1), medium 160×160 (2v2), large 256×256 (FFA and 4v4).
- **Height levels:** each cell sits on one of 8 discrete levels, each a few bricks tall. **Ramps** connect neighbouring levels; everything else between levels is a cliff. High ground gives a vision and firing advantage.
- **Water:** shallow water is passable for infantry and hover units, slow for wheeled units, and blocked for tracked units. Deep water is for naval, hover and air units only.
- **Surfaces:** grass, dirt, sand, rock, snow, ice, road and rubble. Each has a movement cost per domain and a buildability flag.
- **Flat maps** use one height level and no cliffs. They're valid maps, not a special mode.

### Cliffs and ramps

- A **cliff** is any edge between cells on different levels without a ramp. It blocks every ground domain, and blocks line of sight from below (not from above). Cliff faces are stacked bricks in the biome's rock colour.
- A **ramp** is one cell long and faces one of the four grid directions: the ramp cell sits on the lower level, and the cell it faces is exactly one level higher. Ramps are at least 2 cells wide, so vehicles can pass each other. Ramps can't be built on.
- Outer and inner cliff corners, single-cell pillars and narrow passes are all just height data; the renderer picks the brick pieces from the neighbouring cells.

### Water bodies

- **Lakes:** deep water enclosed by land, ringed by at least one cell of shallow shore.
- **Rivers:** shallow water with **fords** (passable for most ground units, slowly) and deep sections that need a bridge ([neutrals-and-map-objects.md](neutrals-and-map-objects.md#bridges)).
- **Coasts and seas:** deep water along a map edge.
- **Shore cells** are the shallow band between land and deep water. Shore structures need them ([structures.md](structures.md#placement)); amphibious units cross them. The band counts diagonal neighbours, so a diagonal shoreline needs two shallow cells.

### Map edge

- The playable area is the map's `size`. Beyond it, a border of 8 cells is rendered as the same terrain continuing, darkened. It can't be entered, built on or targeted, and the camera stops at it.
- Ground units stop at the edge; aircraft turn back.
- Spawns, resource fields and nodes keep at least 4 cells from the edge, so nothing is fought over half off-screen. The map validator checks this.

## Trees and props

- **Forests** are cells of brick-built trees:
  - infantry pass through slowly and get cover and concealment (forests block vision into them);
  - vehicles are blocked, except "crusher" vehicles that flatten trees;
  - artillery and fire clear them, and stumps become passable.
- **Wood:** where the rules define a wood resource, trees are harvestable.
- **Blocking props:** rocks, ruins, walls and fences, some of them destructible.
- **Decorative props:** grass tufts, flowers, small debris. Visual only; the sim never sees them.

## Resource fields and nodes

- **Ore fields** are clusters of ore cells that harvesters mine ([economy.md](economy.md#harvesting)). Units drive over them; nothing can be built on them.
- **Nodes** are single spots (1×1 or 2×2 cells) with something only a particular structure can use: raw-material deposits and oil wells. Each node has a **kind**.
- **Node-bound structures** can only be placed on a node of their kind, and a node accepts nothing else. The node is one of the footprint's cell rules, next to `land`, `shore` and `water` ([structures.md](structures.md#placement)). Destroying the structure leaves the node, so it can be rebuilt or taken over.
- Which structure works each kind of node (a neutral structure any builder can build, or one per faction) is a pending decision ([human-tasks.md](../project/human-tasks.md)).

## Ground under structures

- Placing a structure lays a **foundation** under its footprint, in the biome's foundation surface (concrete, packed dirt, ice slab). The grass or sand underneath is gone while the structure stands.
- A destroyed structure leaves **rubble** on the footprint ([structures.md](structures.md#damage-capture-and-destruction)); once it's cleared or decays, the cells turn to dirt.
- Tracked vehicles leave short-lived track marks and craters fade over time. Both are presentation only.

## Biomes

A biome is a content bundle:
- surface tile set and colour palette;
- prop and tree set;
- water look;
- lighting preset;
- ambient particles (snow, dust, pollen);
- ambient audio.

Starting biomes: **temperate**, **desert**, **arctic** and **urban**. Packs can add more (volcanic, jungle…). A map has a base biome and can paint regions with others.

| Biome     | Main surfaces                         | Cliffs              | Water               | Foundation  |
| --------- | ------------------------------------- | ------------------- | ------------------- | ----------- |
| Temperate | Grass (three shades), dirt, road      | Grey rock           | Blue-green, reeds   | Concrete    |
| Desert    | Sand, dry grass patches, rock         | Sandstone           | Clear, sandy shore  | Packed dirt |
| Arctic    | Snow, ice, dark rock                  | Dark rock with snow | Icy, floes at shore | Ice slab    |
| Urban     | Asphalt, concrete, rubble, park grass | Concrete walls      | Canals              | Concrete    |

- Every cell's colour is the surface's base colour, varied by a few shades picked from a hash of the cell's position. The variation is render-only and the same on every machine.
- Exact colours wait for the art direction sign-off ([human-tasks.md](../project/human-tasks.md)).

## Sandbox maps

Small maps in `content/core/maps/`, each showing one feature, for [debug mode](screens/debug-mode.md) and for tests. Skirmish setup doesn't list them.

| Map                 | Size    | Shows                                                                                        |
| ------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `sandbox-flat`      | 64×64   | One level, temperate, no water: movement, selection, combat                                  |
| `sandbox-terrain`   | 96×96   | Plateaus on levels 0–3, ramps in all four directions, cliff corners, a pillar, a narrow pass |
| `sandbox-water`     | 96×96   | A lake in the middle, a river with a ford and a bridge, a coast along one edge               |
| `sandbox-biomes`    | 128×128 | Four quadrants: temperate, desert, arctic, urban                                             |
| `sandbox-resources` | 64×64   | Ore fields, material and oil nodes, neutral tech structures                                  |

## Weather and time of day

Lighting presets (dawn, day, dusk, night) and weather (rain, snow, sandstorm) are cosmetic by default. A ruleset can opt in to gameplay effects, e.g. reduced vision at night or in a sandstorm. Because those effects are sim state, they're deterministic.

## Rendering

- Terrain is built in chunks (e.g. 16×16 cells), with bevelled blocky tiles and ramps, and LOD per chunk.
- Trees and props are instanced per type, with LOD and fading by distance.
- Water is a stylized animated plane with a shoreline foam mask.
- The fog texture is sampled in the terrain shader; see [fog-of-war.md](fog-of-war.md).

Maps are made in the [map editor](../engineering/map-editor.md).
