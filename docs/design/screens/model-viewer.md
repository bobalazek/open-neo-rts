# Model viewer

**Route:** `/tools/models` · **From:** Map editor menu, Home (developer builds), PR preview links · **Phase:** first playable (phase 2), as soon as the first real model lands.

A sandbox for one model at a time: drop in a GLB and see exactly how the game will use it, before it goes into a pack. It runs the same renderer and the same validator as the game, so "looks right here" means "works in the game".

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ MODEL VIEWER   panther.glb  (drop a .glb or a pack folder anywhere)    ✕     │
│ ┌ NODES ──────────────┐ ┌─────────────────────────────────────┐ ┌ CHECKS ───┐ │
│ │ ▾ hull              │ │                                     │ │ ✔ glTF    │ │
│ │   ▾ turret          │ │      (3D view on the grid, with     │ │ ✔ names   │ │
│ │     ▸ barrel        │ │       a test-faction Rifleman for   │ │ ✔ material│ │
│ │       ◎ muzzle_0    │ │       scale; sockets drawn as       │ │ ⚠ LOD1 62%│ │
│ │   ◎ exhaust_0       │ │       labelled gizmos)              │ │ ✔ 2,840 / │ │
│ │   ◎ smoke_0         │ │                                     │ │   3,000 ▲ │ │
│ │ ▢ state_damaged     │ │                                     │ │ [Details] │ │
│ └─────────────────────┘ └─────────────────────────────────────┘ └───────────┘ │
│ Team [■ red ▾]  LOD [0|1|auto]  Health ──────●─── 72%   [Fire] [Destroy]      │
│ Clips: [idle] [move] [fire_recoil] ▶  Speed 1×   Turret ──●── 40°            │
└───────────────────────────────────────────────────────────────────────────────┘
```

## What it shows

- **Node tree:** every node, with parts, sockets (◎) and damage-state nodes (▢) marked. Clicking a node highlights it in the view.
- **Sockets** drawn as labelled gizmos with their forward direction, so a muzzle socket that points backwards is obvious.
- **Checks panel:** the same results as `bun neo validate-assets` (Khronos glTF validation plus our [model conventions](../../contributing/assets.md#model-conventions)): triangle budget bars, LOD ratio, material slots, missing parts, sockets or clips.
- **Scale reference:** a test-faction Rifleman and the cell grid. Structures also show their footprint from the definition, when one exists.

## What you can try

| Control          | Does                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Team**         | Cycles team colours, so you can check that `team*` material slots tint the right parts and nothing else                   |
| **LOD**          | Forces LOD0 or LOD1, or switches by camera distance                                                                       |
| **Health**       | Drags health from 100% to 0: `state_damaged` below 66%, `state_critical` below 33%, smoke and fire at their sockets       |
| **Fire**         | Fires a test projectile from each muzzle socket in order, with muzzle flash and tracer, to check positions and directions |
| **Destroy**      | Plays the destruction: brick chunks, then the `.wreck.glb` or `.rubble.glb` with the turret's last angle carried over     |
| **Clips**        | Plays each animation clip, including baked vertex animation for skinned models, at adjustable speed                       |
| **Part sliders** | Rotates parts the sim drives (turret, barrel elevation, rotor) to check pivots                                            |

## Editing sockets

Sockets can be added, moved and rotated with gizmos, then exported as an updated GLB (new or changed empty nodes only; geometry is untouched). This is for quick fixes. The editable source in `source/` should get the same change, otherwise the `bun neo validate-assets` out-of-date check flags it.

## States

- **Empty:** drop zone with a link to the asset conventions.
- **Invalid file:** the checks panel lists what's wrong; the view shows whatever could still be loaded.
- **Unsupported features** (more than 4 bone influences, unknown materials): shown as errors, and the model renders with a magenta fallback material so they can't be missed.
