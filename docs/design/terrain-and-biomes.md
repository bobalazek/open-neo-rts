# Terrain, maps and biomes

The 3D world is built from bricks, in the same visual language as the units. Terrain rules feed pathing ([pathfinding.md](../engineering/pathfinding.md)), vision ([fog-of-war.md](fog-of-war.md)) and combat ([combat-and-balance.md](combat-and-balance.md)).

## Shape of the world

- **Grid:** the map is a grid of cells (2 m per cell). Structures, props and resource nodes align to it. Typical sizes: small 96×96 (1v1), medium 160×160 (2v2), large 256×256 (FFA and 4v4).
- **Height levels:** each cell sits on one of 8 discrete levels, each a few bricks tall. **Ramps** connect neighbouring levels; everything else between levels is a cliff. High ground gives a vision and firing advantage.
- **Water:** shallow water is passable for infantry and hover units, slow for wheeled units, and blocked for tracked units. Deep water is for naval, hover and air units only.
- **Surfaces:** grass, dirt, sand, rock, snow, ice, road and rubble. Each has a movement cost per domain and a buildability flag.

## Trees and props

- **Forests** are cells of brick-built trees:
  - infantry pass through slowly and get cover and concealment (forests block vision into them);
  - vehicles are blocked, except "crusher" vehicles that flatten trees;
  - artillery and fire clear them, and stumps become passable.
- **Wood:** where the rules define a wood resource, trees are harvestable.
- **Blocking props:** rocks, ruins, walls and fences, some of them destructible.
- **Decorative props:** grass tufts, flowers, small debris. Visual only; the sim never sees them.
- **Resource nodes:** ore fields, oil derricks, salvage yards and similar, defined by the rules' resources.

## Biomes

A biome is a content bundle:
- surface tile set and colour palette;
- prop and tree set;
- water look;
- lighting preset;
- ambient particles (snow, dust, pollen);
- ambient audio.

Starting biomes: **temperate**, **desert**, **arctic** and **urban**. Packs can add more (volcanic, jungle…). A map has a base biome and can paint regions with others.

## Weather and time of day

Lighting presets (dawn, day, dusk, night) and weather (rain, snow, sandstorm) are cosmetic by default. A ruleset can opt in to gameplay effects, e.g. reduced vision at night or in a sandstorm. Because those effects are sim state, they're deterministic.

## Rendering

- Terrain is built in chunks (e.g. 16×16 cells), with bevelled blocky tiles and ramps, and LOD per chunk.
- Trees and props are instanced per type, with LOD and fading by distance.
- Water is a stylized animated plane with a shoreline foam mask.
- The fog texture is sampled in the terrain shader; see [fog-of-war.md](fog-of-war.md).

Maps are made in the [map editor](../engineering/map-editor.md).
