# Terrain, maps and biomes

The 3D world is built from bricks, in the same visual language as the units. Terrain rules feed pathing ([pathfinding.md](../engineering/pathfinding.md)), vision ([fog-of-war.md](fog-of-war.md)) and combat ([combat-and-balance.md](combat-and-balance.md)).

## Shape of the world

- **Grid:** the map is a grid of cells (2 m per cell). Structures, props and resource nodes align to it. Typical sizes: small 96×96 (1v1), medium 160×160 (2v2), large 256×256 (FFA and 4v4).
- **Height levels:** each cell sits on one of 8 discrete levels, each a few bricks tall. **Ramps** connect neighbouring levels; everything else between levels is a cliff. High ground gives a vision and firing advantage.
- **Water:** the [accepted domain table](../project/decisions/2026-11-01-movement-water-table.md) is authoritative. Foot uses land and shallow water; wheeled uses both with 50% speed in shallow water; tracked uses land only; naval uses deep water only; hover and amphibious use all three. Air crosses all three directly without a navigation grid.
- **Surfaces:** grass, dirt, sand, rock, snow, ice, road and rubble. Each has a movement cost per domain and a buildability flag.
- **Flat maps** use one height level and no cliffs. They're valid maps, not a special mode.

### Cliffs and ramps

- A **cliff** is any edge between cells on different levels without a ramp. It blocks every ground domain, and blocks line of sight from below (not from above). Cliff faces are stacked bricks in the biome's rock colour.
- A **ramp** is one cell long and faces one of the four grid directions: the ramp cell sits on the lower level, and the cell it faces is exactly one level higher. Ramps are at least 2 cells wide, so vehicles can pass each other. Ramps can't be built on.
- Outer and inner cliff corners, single-cell pillars and narrow passes are all just height data; the renderer picks the brick pieces from the neighbouring cells.

### Water bodies

- **Lakes:** deep water enclosed by land, ringed by at least one cell of shallow shore.
- **Rivers:** shallow water with **fords** (passable according to the water table above) and deep sections that need a bridge for land-only domains ([neutrals-and-map-objects.md](neutrals-and-map-objects.md#bridges)).
- **Coasts and seas:** deep water along a map edge.
- **Shore cells** are the shallow band between land and deep water. Shore structures need them ([structures.md](structures.md#placement)); amphibious units cross them. The band counts diagonal neighbours, so a diagonal shoreline needs two shallow cells.

### Map edge

- The playable area is the map's `size`. Beyond it, a border of 8 cells is rendered as the same terrain continuing, darkened. It can't be entered, built on or targeted, and the camera stops at it.
- Ground units stop at the edge; aircraft turn back.
- Spawns, resource fields and nodes keep at least 4 cells from the edge, so nothing is fought over half off-screen. The map validator checks this.

## Props

Props are map objects: trees, rocks, ruins, fences, clutter. Each lives in `content/core/props/<biome>/<name>/` with a `prop.json`, its brick-model source (`source/<name>.bricks.json`) and the built model. Maps place them as `objects` owned by `neutral`. A prop's definition sets:

- **footprint** in cells. Props snap to the grid and turn in 90° steps.
- **blocks:** `nothing` (decoration the sim never sees), `movement`, or `movement-and-vision`. `domains` lists the movement domains it stops; without it, every ground domain is stopped. Vision blocking applies to everyone.
- **destructible:** health, plus `crushable` if crusher vehicles flatten it. Without it the prop is permanent.
- **remains:** `presentation.wreck`. Trees leave a stump (`<name>.stump.glb`: the model without its `canopy` node); ruins and wrecks leave a rubble pile (`<name>.rubble.glb`). Remains are presentation only and block nothing. Small props (fences, crates, cars) burst into bricks and leave nothing.

The roster keeps to what RTS maps generally carry: OpenRA's Red Alert and Tiberian Dawn tilesets (single trees and clusters that leave husks, rocks, tank traps, crates, utility poles), 0 A.D.'s per-biome trees, bushes, rocks and ruins, Beyond All Reason's features (trees, rocks in biome tints, wrecks), StarCraft II's destructible rocks and line-of-sight blockers, and Generals' toppling trees and urban clutter.

### Forests

- A forest is a group of cells, one tree prop each. Trees stop vehicles and block vision; infantry pass through slowly and get cover and concealment inside.
- **Clearing:** crusher vehicles flatten trees, and artillery and fire destroy them. Either way the prop is removed at the next tick boundary, the nav grid and vision update, and a **stump** stays behind. Stumps are passable and block nothing.
- **Dead trees and cacti** stop vehicles but hide nobody: there's no canopy.
- **Wood:** the base game has no wood resource, so trees are cover and blockers only and no prop uses `harvest`. Harvestable trees would need a new resource in `rules/resources.ts`; that's the owner's call ([human-tasks.md](../project/human-tasks.md)).

### Roster (first pass)

**Blocks:** _vehicles_ = wheeled, tracked, hover and amphibious (infantry pass); _ground_ = every ground domain; _vision_ = line of sight for everyone. **Destructible** gives health; _crush_ means crushers flatten it; "—" is permanent.

**Every biome** (`props/common/`):

| Prop               | Size | Blocks         | Destructible | Look                                                        |
| ------------------ | ---- | -------------- | ------------ | ----------------------------------------------------------- |
| Supply crates      | 1×1  | ground         | 100, crush   | Stacked wooden crates with dark bands                       |
| Oil drums          | 1×1  | ground         | 80, crush    | Red, blue and yellow drums, one tipped over                 |
| Tank trap          | 1×1  | vehicles       | 600          | Steel hedgehog of three crossed beams                       |
| Sandbag wall       | 2×1  | ground         | 400, crush   | Three rows of rounded khaki bags                            |
| Burned-out tank    | 2×1  | ground         | 800          | Rusted, charred hull, turret askew, drooping barrel; rubble |
| Wall fragment      | 2×1  | ground         | 800          | Broken red-brick wall with a window gap; rubble             |
| Collapsed building | 3×3  | ground, vision | 2,000        | Two-storey concrete shell over rubble, not garrisonable     |

**Temperate:**

| Prop           | Size | Blocks           | Destructible | Look                                        |
| -------------- | ---- | ---------------- | ------------ | ------------------------------------------- |
| Broadleaf tree | 1×1  | vehicles, vision | 300, crush   | Round layered oak crown, sways; stump       |
| Conifer tree   | 1×1  | vehicles, vision | 300, crush   | Stacked octagonal pine tiers, sways; stump  |
| Dead tree      | 1×1  | vehicles         | 150, crush   | Bare grey trunk and crooked branches; stump |
| Bush           | 1×1  | nothing          | —            | Low green mound with red berries            |
| Reeds          | 1×1  | nothing          | —            | Reed stalks and cattails, for shores        |
| Boulder        | 1×1  | ground           | —            | Rounded grey boulder                        |
| Rock outcrop   | 2×2  | ground, vision   | —            | Tall stepped grey rock                      |
| Wooden fence   | 2×1  | ground           | 100, crush   | Four posts and two rails                    |

**Desert:**

| Prop              | Size | Blocks           | Destructible | Look                                              |
| ----------------- | ---- | ---------------- | ------------ | ------------------------------------------------- |
| Palm tree         | 1×1  | vehicles, vision | 200, crush   | Leaning segmented trunk, drooping fronds; stump   |
| Acacia tree       | 1×1  | vehicles, vision | 300, crush   | Forked trunk under a flat olive umbrella; stump   |
| Cactus            | 1×1  | vehicles         | 100, crush   | Saguaro with two arms and a red flower            |
| Dry shrub         | 1×1  | nothing          | —            | Twigs fanning out of a small mound                |
| Sandstone boulder | 1×1  | ground           | —            | Banded tan boulder                                |
| Sandstone outcrop | 2×2  | ground, vision   | —            | Small mesa: sheer banded sides, broken top corner |
| Adobe ruin        | 2×1  | ground           | 800          | Crumbling mud-brick walls, doorway, beams; rubble |

**Arctic:**

| Prop             | Size | Blocks           | Destructible | Look                                         |
| ---------------- | ---- | ---------------- | ------------ | -------------------------------------------- |
| Snowy conifer    | 1×1  | vehicles, vision | 300, crush   | Pine tiers with snow on each; stump          |
| Frozen dead tree | 1×1  | vehicles         | 150, crush   | Bare trunk with snow along the branches      |
| Snowy bush       | 1×1  | nothing          | —            | Dark evergreen mound under snow              |
| Ice shards       | 1×1  | ground           | 300, crush   | Jagged pale-blue spikes                      |
| Snowy boulder    | 1×1  | ground           | —            | Dark boulder with a snow cap                 |
| Snowy outcrop    | 2×2  | ground, vision   | —            | Dark stepped rock, snow drifts on its ledges |
| Frozen log       | 2×1  | vehicles         | 200, crush   | Fallen trunk with snow along the top         |

**Urban:**

| Prop             | Size | Blocks           | Destructible | Look                                          |
| ---------------- | ---- | ---------------- | ------------ | --------------------------------------------- |
| Park tree        | 1×1  | vehicles, vision | 200, crush   | Small round tree in a concrete planter; stump |
| Streetlight      | 1×1  | nothing          | —            | Pole with an arm and a glowing lamp           |
| Park bench       | 1×1  | nothing          | —            | Wooden slats on steel legs                    |
| Concrete barrier | 2×1  | ground           | 1,000        | Two sloped road-block sections                |
| Chain-link fence | 2×1  | ground           | 150, crush   | Steel posts, see-through panel, wire on top   |
| Wrecked car      | 2×1  | ground           | 300, crush   | Burned-out red car                            |
| Dumpster         | 1×1  | ground           | 200, crush   | Green steel bin with a sloped lid             |
| Rubble pile      | 1×1  | wheeled, hover   | —            | Concrete chunks and rebar; tracks climb over  |

## Resource fields and nodes

- **Ore fields** are clusters of ore cells that harvesters mine ([economy.md](economy.md#harvesting)). Units drive over them; nothing can be built on them.
- **Nodes** are single spots (1×1 or 2×2 cells) with something only a particular structure can use: raw-material deposits and oil wells. Each node has a **kind**.
- **Node-bound structures** can only be placed on a node of their kind, and a node accepts nothing else. The node is one of the footprint's cell rules, next to `land`, `shore` and `water` ([structures.md](structures.md#placement)). Destroying the structure leaves the node, so it can be rebuilt or taken over.
- Which structure works each kind of node (a neutral structure any builder can build, or one per faction) is a pending decision ([human-tasks.md](../project/human-tasks.md)).

### Resource visuals

Resources are engine code, but their look is pack art. The models live in `content/core/resources/<name>/` (`source/<name>.bricks.json` plus the built model), a folder proposed for the content layout. There are no definitions for them yet.

| Visual          | Size                  | Look                                                                                                           | Stages          |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| `ore-cell`      | 1×1, one per ore cell | Piles of studded gold bricks and an amber crystal on the `ore` ground tile; turned in 90° steps by a cell hash | Full to empty   |
| `material-node` | 2×2                   | A grey rock ring around blue-steel veins; a dug-out pit when empty                                             | Full to empty   |
| `oil-well`      | 1×1                   | A black oil seep, a capped wellhead with a red valve and an orange survey flag                                 | None (a marker) |

**Depletion stages,** like `presentation.damageStates` for health:

- A depletable model has nodes `stage_full`, `stage_75`, `stage_50`, `stage_25` and `stage_empty` under its root, and exactly one is visible. The renderer shows the stage for the share of the cell's or node's cap that remains: `stage_full` from 75% up, `stage_75` below 75%, `stage_50` below 50%, `stage_25` below 25%, and `stage_empty` at zero. Unlike damage states, a stage replaces the previous one instead of adding to it.
- A model may skip stages; a missing stage falls back to the next fuller one.
- **Regrowth** runs the same mapping as the amount rises, so the stages step back up. A mined-out ore cell shows `stage_empty`, and its ore ground fades, until it regrows from its neighbours ([economy.md](economy.md#harvesting)).
- An optional short looping **`harvest`** clip plays while a harvester mines the cell (the ore cell's is a squash pulse).
- A material node under its structure is hidden; its stage shows again when the structure is destroyed.
- The triangle budget (props: 1k) covers all stages together.
- Oil nodes and node-bound structures wait on the pending decision in [human-tasks.md](../project/human-tasks.md). Until then the oil-well marker has no stages, since nothing says oil runs out.

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

### Textures

- The style is vertex colours plus one shared palette texture per pack ([assets.md](../contributing/assets.md)), so surface textures are small, tileable, subtle detail tiles: studs, plate seams, noise. Nothing photographic.
- `bun neo generate-textures` writes them to `content/core/textures/` from a fixed seed; [generate-textures.ts](../../apps/cli/src/commands/generate-textures.ts) is their source and holds the colours. `content/<pack>/textures/` is a proposed pack-level folder.
- `palette.png` is 256² in 16 px swatches: the material slots, four shades of each surface (the per-cell variation), then the prop colours.
- Detail tiles are 128², one per cell, eight studs across: `grass-1` to `grass-3` and `dirt-1` to `dirt-3` (studded plates; pebbles on `dirt-2`, packed running-bond tiles on `dirt-3`), `sand` (smooth tiles, wind ripples), `rock` (running-bond blocks), `snow` (faint studs), `ice` (diagonal glints), `road` (flat tiles with aggregate), `rubble` (brick and concrete fragments) and `ore` (studded ground with gold chips). Each tile carries its surface's colour; the per-cell shade multiplies it.

## Sandbox maps

Small maps in `content/core/maps/`, each showing one feature, for [debug mode](screens/debug-mode.md) and for tests. Skirmish setup doesn't list them. `bun neo generate-sandbox-maps <map-id>` writes one map, its layers and a schematic `preview.png`; omitting the ID rewrites all sandbox maps. [generate-sandbox-maps.ts](../../apps/cli/src/commands/generate-sandbox-maps.ts) is their editable source.

| Map                 | Size    | Shows                                                                                                                                |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `sandbox-flat`      | 64×64   | One level, temperate, no water: movement, selection, combat                                                                          |
| `sandbox-terrain`   | 96×96   | Plateaus on levels 0–3, ramps in all four directions, cliff corners, a pillar, a narrow pass                                         |
| `sandbox-water`     | 96×96   | A lake in the middle, a river with a ford between two deep sections (where a bridge goes once bridges exist), a coast along one edge |
| `sandbox-biomes`    | 128×128 | Four quadrants: temperate, desert, arctic, urban                                                                                     |
| `sandbox-resources` | 64×64   | Ore fields, material and oil nodes, neutral tech structures                                                                          |

## Weather and time of day

Lighting presets (dawn, day, dusk, night) and weather (rain, snow, sandstorm) are cosmetic by default. A ruleset can opt in to gameplay effects, e.g. reduced vision at night or in a sandstorm. Because those effects are sim state, they're deterministic.

## Rendering

- Terrain is built in chunks (e.g. 16×16 cells), with bevelled blocky tiles and ramps, and LOD per chunk.
- Trees and props are instanced per type, with LOD and fading by distance.
- Water is a stylized animated plane with a shoreline foam mask.
- The fog texture is sampled in the terrain shader; see [fog-of-war.md](fog-of-war.md).

Maps are made in the [map editor](../engineering/map-editor.md).
