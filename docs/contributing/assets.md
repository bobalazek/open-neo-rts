# Assets

Models, icons, textures and sounds. All of them are original work, live **in this repository** next to the definition that uses them, and are stored with Git LFS. The art style is in [art-and-audio.md](../design/art-and-audio.md).

**Status:** first-pass brick models are being built for every unit and structure ([decision](../project/decisions/2026-11-01-first-pass-models.md)); the art direction sign-off, with one finished reference model per faction, is a [human task](../project/human-tasks.md). `bun neo make-placeholders` can still generate temporary block models locally, but they aren't committed.

## Where assets go

Assets sit in the same folder as the definition that uses them:

```text
content/core/factions/eastern-collective/units/dragon-tank/
├── unit.json                     the definition: stats, weapons, abilities, presentation
├── dragon-tank.glb               runtime model
├── dragon-tank.wreck.glb         wreck model (vehicles)
├── dragon-tank.icon.png          icon, 128 × 128
├── dragon-tank.fire.1.ogg        sounds: <name>.<event>[.<n>].ogg
├── assets.json                   author and source of every file in this folder
└── source/
    └── dragon-tank.bricks.json   editable original
```

## Brick models

First-pass models are written as brick sources, `source/<name>.bricks.json`, in the format defined in [apps/cli/src/models/bricks.ts](../../apps/cli/src/models/bricks.ts): named nodes with pivots, bricks of 0.25 m units with a material slot (and a vertex colour for `palette` bricks), slopes and cylinders, keyframed clips, and a rule for the destroyed model. The source names its `author`.

`bun neo build-models <faction | folder | file>` turns each source into `<name>.glb`, the icon, the wreck (the same parts, burnt and chipped) or rubble (brick heaps on the footprint) named by `presentation.wreck`, and the `assets.json` entries. Rebuild after editing a source and commit both. Hand-made models from another tool (a `.blend`, say) follow the same conventions and need no brick source.

**Rigs.** Brick models move by rigid nodes, one per moving piece, not skinned meshes; each clip rotates or offsets whole nodes around their pivots. Use the same node names everywhere so the renderer and every model agree:

```text
infantry                               vehicles
body                                   hull
└── hips                               ├── track_l, track_r (or wheels)
    ├── leg_l, leg_r                   ├── turret              sim-driven: aims
    └── torso                          │   └── barrel          sim-driven: elevates, recoils
        ├── head                       │       └── socket_muzzle_0
        ├── arm_l, arm_r               └── socket_exhaust_0
        └── weapon
            └── socket_muzzle_0
```

Aircraft add `rotor` nodes; structures add whatever their `active`, `open` and `close` clips move (doors, fans, radar dishes).

Structures are the same, with `structure.json` and `<name>.rubble.glb`. Neutral structures live in `content/core/neutral/structures/<name>/`, and map props (trees, rocks, ruins) in `content/core/props/<biome>/<name>/` with a `prop.json`. A definition's `presentation` refers to its files by name only (`"model": "dragon-tank.glb"`).

## Git LFS

Binary files are stored with **Git LFS** ([.gitattributes](../../.gitattributes)). Run `git lfs install` once after cloning.

- Adding a new binary file type means adding its extension to `.gitattributes` in the same PR.
- LFS storage and bandwidth are metered on GitHub. Don't commit throwaway iterations; squash big rework into one commit. CI's `verify` job downloads only the four GLBs read by renderer tests, explicitly listed in `ci.yml`. The `browsers` job pulls its model and map fixtures; the `content` job pulls all LFS with a cache.

## Authorship

Every folder with assets has an `assets.json`:

```json
{
  "files": {
    "dragon-tank.glb": { "author": "Jane Doe", "source": "source/dragon-tank.blend" }
  }
}
```

- **Every asset is original work** made for this game, contributed under the repository's MIT licence. No downloaded, purchased, ripped or traced assets.
- `author` feeds the credits screen; `source` points at the editable original.
- CI rejects runtime files without an entry, and entries without a file.

## Formats and budgets

| Kind       | Format                                                                      | Budget                                                                                                          |
| ---------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Models     | glTF binary (`.glb`), Y-up, metres, origin at ground centre, front faces +Z | Infantry about 1k triangles, vehicles 3k, structures 6k, props 1k, wrecks 2k; up to 2 LODs                      |
| Textures   | One shared palette texture per pack (`.png`); vertex colours where possible | 256² palette; decals at most 512²                                                                               |
| Animations | Inside the `.glb`, named clips; skeletons allowed                           | Only the clips the definition lists                                                                             |
| Icons      | `.png` with transparency, square                                            | Drawn at 128², shown at 64 or 48                                                                                |
| Audio      | `.ogg` (Vorbis or Opus)                                                     | Effects mono, music stereo; loudness rules in [audio-events.md](../design/audio-events.md#formats-and-loudness) |

## Model conventions

glTF has no standard for game attachment points, damage states or LODs, so these are ours. `bun neo validate` checks every rule marked ✓, comparing each model with its definition.

| Rule                   | Detail                                                                                                                                                                                                                                                                                                                        | Checked |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Orientation and origin | Y-up, metres, front faces +Z, origin at ground centre, root nodes without offset                                                                                                                                                                                                                                              | ✓       |
| Size                   | The model's footprint matches the definition: a structure's `footprint` in cells (2 m each), a unit's collision `radius`                                                                                                                                                                                                      | ✓       |
| Node names             | Every node named, names unique. Parts the sim drives use fixed names listed in `presentation.parts`: `hull`, `turret`, `barrel`, `rotor`, `legs`                                                                                                                                                                              | ✓       |
| Materials              | Every material maps to a **slot**: `palette`, `team`, `team_dark`, `team_light`, `team_emissive`, `metal`, `glass`, `emissive`. Name materials after slots, or map the artist's names in `presentation.materials`. Any number of materials can follow the team colour                                                         | ✓       |
| Sockets                | Empty nodes `socket_<name>` (lowercase letters), listed in `presentation.sockets`: the muzzle each weapon fires from (its `socket`, default `socket_muzzle`), `socket_exhaust`, `socket_smoke` and `socket_fire` (damage effects), `socket_exit` (production structures), `socket_dock` (drop-offs, pads), `socket_healthbar` | ✓       |
| Damage states          | Optional hidden nodes `state_damaged` and `state_critical`, shown at the thresholds in `presentation.damageStates` (default 66% and 33%). Without them, the renderer uses missing-brick decals and smoke and fire at the sockets                                                                                              | ✓       |
| LODs                   | `<node>` or `<node>_LOD0`, and `<node>_LOD1` for distance; LOD1 at most half the triangles of LOD0                                                                                                                                                                                                                            | ✓       |
| Skeletons              | Allowed for infantry and walkers: at most 64 joints and 4 influences per vertex; rigid weights (one bone per brick) suit the style                                                                                                                                                                                            | ✓       |
| Animations             | snake_case clip names. Infantry: `idle`, `move`, `attack`, `death`. Vehicles: optional (`fire_recoil`); the sim drives parts. Structures: optional `active`, `open`, `close`                                                                                                                                                  | ✓       |
| Destruction            | Vehicles: a wreck model with the same part names, so the turret keeps its last angle. Structures: a rubble model. Flying brick chunks are generated at runtime                                                                                                                                                                | ✓       |
| Collision              | Never from the mesh: footprints and radii come from the definition                                                                                                                                                                                                                                                            | —       |

How these are rendered (instancing, damage states, construction and destruction) is in [rendering.md](../engineering/rendering.md).
