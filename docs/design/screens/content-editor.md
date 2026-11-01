# Content editor and model viewer

**Route:** `/tools/content` (`/tools/content?model=…` opens the model viewer on its own) · **From:** Map editor menu, Home (developer builds), PR preview links · **Phase:** model viewer in phase 2, definition editing once the content schemas land (phase 2–3).

Editing units and structures by hand-writing JSON is error-prone, and checking a model means starting a match. The content editor puts both in one place: the model on the left, the definition as a form on the right, and live validation. It saves the same JSON files that live in `content/packs/`, so it's a convenience, never a second source of truth.

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ CONTENT EDITOR   neo-2035 ▾        [Units ▾] [ Search… ]          ● unsaved   [Save] │
│ ┌ DEFINITIONS ──┐ ┌──────────────────────────────────┐ ┌ unit:panther ──────────────┐ │
│ │ ▾ AFN         │ │                                  │ │ [General][Combat][Visuals] │ │
│ │   Panther  ◀  │ │   (3D model on the grid, with a  │ │ [Production][Upgrades]     │ │
│ │   Striker     │ │    test-faction Rifleman for     │ │ [Eras]                     │ │
│ │   Raptor      │ │    scale; sockets as labelled    │ │                            │ │
│ │ ▾ EC          │ │    gizmos; damage states,        │ │ (form generated from the   │ │
│ │   Dragon Tank │ │    firing and destruction        │ │  JSON schema; see tabs     │ │
│ │ ▸ PI          │ │    previews)                     │ │  below)                    │ │
│ │ [+ New unit]  │ │                                  │ │                            │ │
│ └───────────────┘ └──────────────────────────────────┘ └────────────────────────────┘ │
│ Team [■ red ▾] LOD [0|1|auto] Health ──●── 72% [Fire] [Destroy] Clips [idle ▶]  Era ▾ │
│ CHECKS: ✔ schema ✔ references ✔ glTF ⚠ LOD1 62% of LOD0 ✔ sockets ✔ materials      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Definition tabs

The form is generated from the content schemas, so new fields appear without editor work. Every field shows its unit (ticks, cells, per-mille) and converts to and from human units.

| Tab            | Edits                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **General**    | ID, faction, family (infantry, vehicle, aircraft, naval…), name and description (locale keys, with the English text edited inline), tags, population cost, health, armour class, vision, speed, movement domain                                                                                                                                                                                                                      |
| **Combat**     | Weapon slots: pick or create weapons (damage type, damage, range, reload, projectile, splash, targets), and assign each to a **muzzle socket** on the model, shown live in the view. Abilities, stances, auto-cast defaults                                                                                                                                                                                                          |
| **Visuals**    | Model file per LOD, wreck or rubble model, icon. The **material map**: every material in the GLB is listed, and you assign each to a slot (`team`, `team_dark`, `team_light`, `team_emissive`, `palette`, `metal`, `glass`, `emissive`). Any number of materials can follow the team colour, and the preview recolours as you change the team. Part names the sim drives (hull, turret, barrel), sockets, damage-state nodes, sounds |
| **Production** | Cost, build time, produced by, requirements (techs, structures), hotkey slot on the command card                                                                                                                                                                                                                                                                                                                                     |
| **Upgrades**   | Upgrades this unit can take (research, field mod kits), and what each changes; each change is previewed on the stats and, if it swaps parts, on the model                                                                                                                                                                                                                                                                            |
| **Eras**       | Which eras the unit exists in, and per era: model, icon, stat and weapon overrides ([content-and-eras.md §4](../content-and-eras.md#4-eras-and-tech)). The era picker in the toolbar previews each variant                                                                                                                                                                                                                           |

Structures get the same tabs, plus **Footprint** (cells, rotation, exits and dock sockets, drawn on the grid), production lists, power, and adjacency bonuses.

## Model viewer

The 3D panel works on its own too: drop any GLB to check it before it has a definition.

| Control          | Does                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Team**         | Cycles team colours to check which parts follow them                                                                |
| **LOD**          | Forces LOD0 or LOD1, or switches by camera distance                                                                 |
| **Health**       | Drags health from 100% to 0: `state_damaged` below 66%, `state_critical` below 33%, smoke and fire at their sockets |
| **Fire**         | Fires each weapon from its assigned muzzle socket, with muzzle flash and tracer, to check positions and directions  |
| **Destroy**      | Plays the destruction: brick chunks, then the wreck or rubble model with the turret's last angle carried over       |
| **Clips**        | Plays animation clips, including baked vertex animation for skinned models                                          |
| **Part sliders** | Rotates parts the sim drives (turret, barrel elevation, rotor) to check pivots                                      |
| **Sockets**      | Add, move or rotate sockets with gizmos; export an updated GLB (empty nodes only, geometry untouched)               |

## Saving

- **Save** writes the definition JSON (and locale strings) into the pack, formatted the way Biome formats it, so diffs stay clean.
  - **Desktop app and local dev server:** writes files straight into the repo checkout.
  - **Web:** uses the browser's File System Access API on a chosen pack folder, or downloads the files where that API isn't available.
- Saving runs the same checks as `bun neo validate-assets` and the content validator. Errors block saving; warnings don't.
- **New unit** starts from a template: the faction's closest existing unit, or a blank family template.

## States

- **Empty:** pick a pack folder, or drop a GLB to use the viewer alone.
- **Invalid file:** the checks bar lists what's wrong, and the view shows whatever could still load. Unknown materials render magenta, so they can't be missed.
- **Conflicting edits:** if the file changed on disk since it was opened, saving shows a diff and asks which version to keep.
