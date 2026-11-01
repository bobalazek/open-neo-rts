# Maps, terrain, navigation and integrated editor

**Status:** proposed. Map file format examples are illustrative.

## 1. Goals

Creators must be able to make a custom map **without writing code**, validate it, press Playtest and share the result as an ordinary content pack. Maps should work in solo skirmish, hosted multiplayer, AI-vs-AI tests and scripted campaigns. The editor shares terrain rendering and resource definitions with the game, but editor state (gizmos, undo history, drafts) remains outside authoritative simulation.

## 2. Three representations

1. **Editable source:** JSON manifest for metadata/object placement/layers plus binary or compressed heightmap/paint data. Includes authoring-only identifiers, brush layers and scenario setup.
2. **Compiled runtime map:** Deterministic representation of height/terrain types, ground buildability, spawn slots, entity instances, resources, control zones, mission references, height collision and fixed-point nav/visibility caches. Version and content hash required.
3. **Presentation assets:** Meshes, materials, vegetation, terrain splats, water, atmosphere, baked details and thumbnails. These never define simulation legality by themselves.

A runtime game must not depend on the editor's current unsaved brush state. Map compilation is repeatable for the same source, tool version and content registry. Preserve unknown future-format fields only in compatible, namespaced extension sections.

## 3. Editable map schema

```yaml
id: map:test-valley
version: 1
formatVersion: 1
packs: [core]
size: { widthCells: 128, heightCells: 128, metersPerCell: 2 }
terrain:
  heightLevels: height.r8 # discrete level per cell (0-7)
  rampLayer: ramps.r8 # ramp cells and direction
  biomeLayer: biome.r8
  surfaceLayer: surface.r8
  waterLevel: 0
  domainMasks: { foot: foot.r8, tracked: tracked.r8 } # per movement domain, optional overrides
spawnSlots:
  - { id: north, x: 20, y: 20, facing: 135, teamsAllowed: [1, 2] }
  - { id: south, x: 108, y: 108, facing: 315, teamsAllowed: [1, 2] }
resourceNodes:
  - { id: ore-north, resource: materials, position: [32, 26], quantity: 20000 }
objects: []
regions: []
objectives: []
editor: { symmetry: rotational-2, notes: "" }
```

The example syntax is a design sketch, not a currently supported runtime format. Coordinates should be integer grid or quantized world values with documented units; orientation must map to stable integer angle representation. Compiled bundles include map source hash, pack dependencies and compiler version.

## 4. Terrain and movement domains

Authoritative elevation is a grid of discrete height levels connected by ramps (2.5D), displayed as a blocky 3D mesh; see [terrain-and-biomes.md](../design/terrain-and-biomes.md). Terrain types include flat ground, slope, cliffs, roads, rubble, shallow/deep water, bridges and optionally destructible obstacles. An infantry path may cross terrain unavailable to a heavy tracked vehicle. Future ships require water nav; aircraft use altitude/airspace constraints and base infrastructure rather than ground nav. Line of sight accounts for terrain height, buildings and smoke as the ruleset chooses.

A deterministic grid/A* with fixed tie-breaking is the first navigation approach. Hierarchical zones and flow fields can improve scale later. Terrain edits at runtime are out-of-scope initially; building footprints, bridge states and destroyed obstacles can invalidate localized nav regions at exact ticks. Path requests have deterministic FIFO/priority budgets so the order of queries cannot change outcomes. Don't make async worker completion order control authoritative decisions.

## 5. Editor tools by milestone

| Milestone           | Creator tools                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First version       | New/open/save, terrain height/paint, spawn placement, resources, camera, run validation                                                                |
| First usable editor | Raise/lower/flatten/smooth, terrain brushes, props, buildings, object inspector, grid snap/rotation, copy/paste, undo/redo, playtest                   |
| Maps 1.0            | Water/cliffs/bridges/roads, path/blocking overlays, resource balance view, team slots, neutrality/capture, publishing/export, multiplayer verification |
| Scenario editor     | Trigger graph, timed events, objective editor, dialogue, camera rails, mission previews and deterministic scenario validation                          |
| Advanced            | Symmetry brushes, procedural generation, auto-layout, script visualizer, collaborative editing/version control, workshop integration                   |

Use command-based editor transactions with reversible actions and stable object IDs. Autosave drafts locally; exports are explicit. Editor tool panels can be React; map display and object meshes use the shared renderer package. Avoid building in-engine 3D modeling tools: use Blender/glTF assets.

## 6. Special overlays

- Buildable cells per structure footprint and faction rules.
- Movement costs per movement domain (foot, wheeled, tracked, hover, amphibious, naval).
- Traversability connectivity/chokepoints and bridges.
- Team spawn fairness and starting resources.
- Territorial influence from cities, forts, command hubs and custom sources.
- Supply connectivity, expected attrition zones and trade routes for relevant profiles.
- Fog-of-war preview, stealth detection ranges, high-ground visibility.
- Capturable points, victory regions, wonder placement and scenario triggers.

None should require a separate hand-coded editor implementation for each content pack. Overlays query the same authoritative map rules and game-profile definitions used at runtime.

## 7. Validation and fairness

Structural checks: schema valid, safe file names and sizes, compatible content pack IDs, valid asset paths, unique IDs, valid coordinates, non-overlapping reserved spawn footprints, no impossible bridge intersections, map hash reproducible.

Gameplay checks: reachable resource deposits from each spawn, adequate start area for chosen headquarters, each team can reach relevant objectives, no unintentional completely isolated terrain classes, no infinite production exploit from special placements, correct resource names for active profile, and predictable influence/city capture behavior.

Fairness hints: compare spawn-to-node distance, defensible terrain, high-ground advantages, strategic points and multi-route access. Make hints informative rather than blocking all asymmetric maps. Players can intentionally author imbalanced scenarios.

## 8. Playtest loop

`Editor draft -> validate -> compile runtime -> start local simulation with the map/AI -> play or inspect -> return -> edit`. Playtest is sandboxed and cannot alter source without explicit save. Map export must run the exact validation/compilation used by multiplayer hosts. Host may refuse invalid/untrusted imports or require pack hashes.

## 9. Security and file constraints

Never execute a file's embedded JavaScript. Scenario triggers are restricted declarative effects whose IDs resolve to known registered deterministic behaviors. Sanitize ZIP traversal, oversized binaries, unsafe image decompression, cyclic asset references and unsupported glTF extensions. Cap resource counts and geometry budgets on public servers. Contributors retain license/provenance for included assets.

## 10. Acceptance tests

- Exporting and importing a map retains height, paint, spawns, resources and authored objects.
- Compiling identical inputs twice yields the same runtime hash.
- Rebuilding navigation after a new building footprint changes path results deterministically.
- One map works unchanged in Web Worker skirmish and headless Node match server.
- Editor flags unreachable spawn resources and missing content definitions with actionable locations.
- Territory preview matches simulated influence for same initialization.
- A map editor change can be undone/redone and produces the exact pre-change hash after undo.
