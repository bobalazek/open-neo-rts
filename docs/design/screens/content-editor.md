# Content editor and model viewer

The [socket editor](../../project/decisions/2026-11-05-model-socket-editing.md)
now supplies native Move/Rotate gizmos, model-local numeric fields and attachment
creation. Apply validates/reimports a preview; Cancel restores the original
nodes, and Download GLB preserves geometry/animation chunks in a separate copy.
Part controls, material mappings and the remaining asset editor remain work.

**Route:** `/tools/content` (`/tools/content?model=…` opens the model viewer on its own) · **From:** Map editor menu, Home (developer builds), PR preview links · **Phase:** 2, model viewer first, then definition editing ([roadmap](../../project/roadmap.md#what-each-phase-builds)).

Editing units and structures by hand-writing JSON is error-prone, and checking a model means starting a match. The content editor puts both in one place: the model on the left, the definition as a form on the right, and live validation. It saves the same JSON files that live in the content packs (`content/<pack>/`), so it's a convenience, never a second source of truth.

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ CONTENT EDITOR  core ▾  unit:alliance-of-free-nations/panther-mbt  ● unsaved  [Save] │
│ ┌ DEFINITIONS ───────────────┐ ┌────────────────────┐ ┌────────────────────────────┐ │
│ │ [Units ▾] [ Search… ]      │ │ (3D model on the   │ │ [General][Combat][Visuals] │ │
│ │ ▾ Alliance of Free Nations │ │ grid, with a       │ │ [Production][Upgrades]     │ │
│ │   Panther MBT  ◀           │ │ Collective Soldier │ │ [Eras]                     │ │
│ │   Striker IFV              │ │ for scale; sockets │ │                            │ │
│ │   Raptor VTOL              │ │ as labelled        │ │ (form generated from the   │ │
│ │ ▾ Eastern Collective       │ │ gizmos; damage     │ │ JSON schema; see tabs      │ │
│ │   Dragon Tank              │ │ states, firing and │ │ below)                     │ │
│ │ ▸ Phoenix Initiative       │ │ destruction        │ │                            │ │
│ │ [+ New unit]               │ │ previews)          │ │                            │ │
│ └────────────────────────────┘ └────────────────────┘ └────────────────────────────┘ │
│ Team [■ red ▾] LOD [0|1|auto] Health ──●── 72% [Fire] [Destroy] Clips [idle ▶] Era ▾ │
│ CHECKS: ✔ schema ✔ references ✔ glTF ⚠ LOD1 62% of LOD0 ✔ sockets ✔ materials        │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Definition tabs

The form is generated from the content schemas, so new fields appear without editor work. Every field shows its unit (ticks, cells, per-mille) and converts to and from human units.

| Tab            | Edits                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **General**    | ID, faction, role, family (infantry, vehicle, aircraft, naval), English name and description, tags, population cost, health, armour class, resistances, vision, speed, movement domain                                                                                                                                                                                                                                               |
| **Combat**     | Weapons, inline: the launcher (targets, range, reload, burst, accuracy, aim, arc), the projectile kind and its fields, and the warheads (damage with `versus` per armour class, burn, disable, slow, reveal, spawn). Each weapon fires from a **muzzle socket** on the model (`socket`, default `socket_muzzle`), shown live in the view. Abilities, stances, auto-cast defaults                                                     |
| **Visuals**    | Model file per LOD, wreck or rubble model, icon. The **material map**: every material in the GLB is listed, and you assign each to a slot (`team`, `team_dark`, `team_light`, `team_emissive`, `palette`, `metal`, `glass`, `emissive`). Any number of materials can follow the team colour, and the preview recolours as you change the team. Part names the sim drives (hull, turret, barrel), sockets, damage-state nodes, sounds |
| **Production** | Cost, build time, produced by (units only), requirements (structures, research), hotkey slot on the command card                                                                                                                                                                                                                                                                                                                     |
| **Upgrades**   | Upgrades this unit can take (research, and Phoenix Initiative field modifications), and what each changes; each change is previewed on the stats and, if it swaps parts, on the model                                                                                                                                                                                                                                                |
| **Eras**       | Which eras the unit exists in, and per era: model, icon, stat and weapon overrides ([content-and-eras.md §4](../content-and-eras.md#4-eras-and-tech)). The era picker in the toolbar previews each variant                                                                                                                                                                                                                           |

Structures get the same tabs, plus **Footprint** (cells, rotation, exits and dock sockets, drawn on the grid), the research they offer, power, and adjacency bonuses. Their Production tab has no produced by: builders construct structures on site, and what a structure trains comes from each unit's produced by.

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

- **Save** writes the definition JSON, with its English text inline, into the pack, formatted the way Biome formats it, so diffs stay clean.
  - **Desktop app and local dev server:** writes files straight into the repo checkout.
  - **Web:** uses the browser's File System Access API on a chosen pack folder, or downloads the files where that API isn't available.
- Saving runs the same checks as `bun neo validate`. Errors block saving; warnings don't.
- **New unit** starts from a template: the faction's closest existing unit, or a blank family template.

## States

- **Empty:** pick a pack folder, or drop a GLB to use the viewer alone.
- **Invalid file:** the checks bar lists what's wrong, and the view shows whatever could still load. Unknown materials render magenta, so they can't be missed.
- **Conflicting edits:** if the file changed on disk since it was opened, saving shows a diff and asks which version to keep.
