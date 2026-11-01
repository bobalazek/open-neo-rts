# Assets

**Status:** proposed. Budgets and formats get tightened once the art direction settles.

All game assets live **in this repository**, next to the content that uses them, so a checkout plus `bun install` gives you a complete, playable game.

## Where assets go

```text
content/packs/<pack>/
├── units/panther.json                 definition (data)
├── assets/
│   ├── units/panther/
│   │   ├── panther.glb                runtime model
│   │   ├── panther.icon.webp          build-menu icon
│   │   └── assets.json                provenance for this folder
│   ├── audio/…
│   └── textures/…
└── source/                            optional editable sources
    └── units/panther/panther.blend
```

- `assets/` holds what the game loads at runtime. `source/` holds editable originals (Blender, layered images, uncompressed audio) so others can modify the work.
- Folder and file names are lowercase kebab-case and match the definition ID (`unit:panther` → `units/panther/`).

## Git LFS

Binary files are stored with **Git LFS** (configured in [.gitattributes](../../.gitattributes)). Run `git lfs install` once after cloning.

- If you add a new binary file type, add its extension to `.gitattributes` in the same PR.
- GitHub's LFS storage and bandwidth quotas are limited on free plans. Keep files within budget, don't commit throwaway iterations, and squash big asset rework into one commit where possible. If quotas become a problem, `source/` can move to a separate asset repository; runtime assets stay here.

## Originality and authorship

Every asset folder has an `assets.json`:

```json
{
  "files": {
    "panther.glb": {
      "author": "Jane Doe",
      "source": "source/units/panther/panther.blend"
    }
  }
}
```

- **Every asset is original work made for open-neo-rts**, contributed under the repository's MIT licence. No downloaded, purchased, ripped or traced assets.
- `author` feeds the in-game credits screen; `source` points at the editable original when there is one.
- CI rejects files without an `assets.json` entry.

## Formats and budgets

| Kind       | Format                                                                                     | Draft budget                                                    |
| ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Models     | glTF binary (`.glb`), Y-up, metres, origin at ground centre                                | Infantry ≤ 1k tris, vehicles ≤ 3k, buildings ≤ 6k; up to 2 LODs |
| Textures   | Shared palette texture per pack (`.png`); vertex colours where possible                    | 256² palette; detail decals ≤ 512²                              |
| Animations | Embedded in the `.glb`, named clips (`idle`, `move`, `attack`, `death`); skeletons allowed | Only clips the definition references                            |
| Audio      | `.ogg` (Opus or Vorbis)                                                                    | Short SFX mono; music stereo                                    |
| Icons      | `.webp`, square                                                                            | 256²                                                            |

The style is blocky, toy-brick low-poly; see [art-and-audio.md](../design/art-and-audio.md). Team colour comes only from the `team*` material slots, never baked into textures, so any model works for any team.

## Model conventions

glTF has no standard for game attachment points, damage states or LODs, so these are ours. `bun run validate-assets` checks every rule marked ✓.

| Rule                   | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Checked                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Orientation and origin | Y-up, metres, front faces +Z (glTF convention), origin at ground centre, root nodes without offset                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ✓ (root offset)                                          |
| Node names             | Every node named, names unique. Parts the sim or renderer drive use fixed names: `hull`, `turret`, `barrel`, `rotor`, `legs`… as listed in the definition's `presentation.parts`                                                                                                                                                                                                                                                                                                                                                                    | ✓                                                        |
| Materials              | Every material maps to a **slot**: `palette` (fixed colours from the pack palette), `team`, `team_dark`, `team_light`, `team_emissive` (follow the owner's team colour), `metal`, `glass`, `emissive`. Either name materials after slots, or keep the artist's names and map them in the definition's `presentation.materials` (the content editor does this with a dropdown per material). Any number of materials can map to `team*` slots: a red team's tank is red wherever they're used, while metal, glass and palette parts stay as authored | ✓                                                        |
| LODs                   | `<name>` or `<name>_LOD0` for full detail, `<name>_LOD1` for distance; at most two levels; LOD1 at most half the triangles of LOD0                                                                                                                                                                                                                                                                                                                                                                                                                  | ✓                                                        |
| Triangle budget        | Per kind: unit 3,000 (infantry should stay near 1,000), structure 6,000, prop 1,000, wreck 2,000                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ✓                                                        |
| Sockets                | Empty nodes named `socket_<name>` or `socket_<name>_<n>`: `socket_muzzle_0` (one per weapon barrel), `socket_exhaust_0`, `socket_smoke_0`, `socket_fire_0`, `socket_exit` (production structures), `socket_dock` (refineries, pads), `socket_healthbar`                                                                                                                                                                                                                                                                                             | ✓ (format, emptiness, required list from the definition) |
| Damage states          | Optional hidden nodes `state_damaged` (shown below 66% health) and `state_critical` (below 33%). Without them, the renderer uses missing-brick decals and particles at the smoke and fire sockets. Structures need at least one `socket_smoke_<n>`                                                                                                                                                                                                                                                                                                  | ✓                                                        |
| Skeletons              | Allowed (infantry, walkers): at most 64 joints, at most 4 influences per vertex; rigid weights (one bone per brick) suit the style. Skinned units are baked to vertex animation textures at load, so they still instance                                                                                                                                                                                                                                                                                                                            | ✓                                                        |
| Animations             | snake_case clip names, unique. Infantry: `idle`, `move`, `attack`, `death`. Vehicles: parts are driven by the sim, so clips are optional (`fire_recoil`). Structures: optional `active`, `open`, `close`                                                                                                                                                                                                                                                                                                                                            | ✓ (names; required clips from the definition)            |
| Destruction            | Vehicles have a separate **wreck** model `<id>.wreck.glb` using the same part names, so the turret keeps its last angle. Structures have `<id>.rubble.glb`. Flying brick chunks are generated from the palette at runtime and need no asset                                                                                                                                                                                                                                                                                                         | ✓ (wreck has no animations)                              |
| Collision              | Never from the mesh. Footprints and radii come from the definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —                                                        |

How these are rendered (instancing, damage states, destruction) is in [rendering.md](../engineering/rendering.md).

## Validation

`bun run validate-assets` checks glTF validity (Khronos validator), the model conventions above, and provenance: every runtime file has an `assets.json` entry, and every entry has a file. Planned: orphaned files (no definition references them) and required parts, sockets and clips per definition, once content schemas exist. The full list is in [content-pipeline.md](../engineering/content-pipeline.md).
