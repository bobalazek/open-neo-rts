# Rendering

`packages/render`, on Babylon.js. The renderer reads presentation snapshots from the sim and never writes to it. Art direction and graphics presets are in [art-and-audio.md](../design/art-and-audio.md).

## Frame loop

- The sim ticks at a fixed 20 Hz (in a Web Worker offline, on the server online). The renderer draws at display rate and **interpolates** positions, rotations and turret angles between the last two ticks, without extrapolating.
- Each frame, the renderer uses the latest presentation snapshot: changed transforms, spawned and removed entities, and events (shots, deaths, construction progress).
- Visual-only work (particles, debris, hit flashes, UI labels) lives entirely in the renderer.

## Instancing

Hundreds of units and thousands of props only work with instancing.

- **One instanced mesh per (model part, LOD)**, using Babylon thin instances. All Panthers' hulls are one draw call, all their turrets another.
- **Two animation paths:** vehicles and structures are hierarchies of parts (hull, turret, barrel, rotors) moved by per-part transforms that the sim drives, written straight into instance matrices. Skinned units (infantry, walkers) are **baked to vertex animation textures** at load, so every instance plays its own clip and phase from one shared texture and still costs one draw call per mesh. CPU skinning is only used for the few close-up units in cinematics.
- **Team colour** is a per-instance attribute that the `team*` material slots read, so one mesh serves every team.
- **Instance buffers** update only for entities that moved this frame. Static props and structures are written once.
- Trees, rocks, projectiles, tracers, selection rings and health bars are instanced too.
- **Target:** under 300 draw calls at the medium preset with 300 units on screen.

## Culling and LOD

- Terrain chunks and instance groups are frustum-culled. Up to 2 LODs per model, chosen by camera distance with an LOD bias setting.
- Entities in fog aren't sent to the client at all ([fog-of-war.md](../design/fog-of-war.md)), so they cost nothing.

## Construction and destruction

- **Building up:** structures assemble brick-layer by brick-layer from the ground, driven by the construction progress in the sim (0–100% reveals layers). A scaffold outline shows the full footprint while building.
- **Units leaving a factory** do a quick snap-together assembly at the exit.
- **Packing up and deploying** (Phoenix Initiative mobile structures such as the Command Node) shuffles the bricks into the vehicle form and back.
- **Damage states:** below 66% and 33% health, models show missing bricks, smoke and sparks.
- **Destruction:** on a death event, the model breaks into instanced brick chunks with simple visual-only ballistics. Vehicles then settle into the **wreck** pile, which is a real sim entity (salvage). Structures crumble top-down into rubble.
- **Selling** plays the construction animation in reverse.

## Health bars and labels

- Drawn as instanced billboard quads in a single draw call, not DOM elements, so 500 bars cost almost nothing.
- **Units:** a segmented health bar, with a shield bar (Alliance of Free Nations) above it and veterancy chevrons.
- **Structures:** a wider bar, a construction or production progress bar, and power and repair icons.
- **Visibility** follows the setting (always / damaged / selected). Colour goes green → yellow → red, with a pattern for colour-blind modes.
- Floating labels (names, rally lines, waypoints) use the same instanced approach.

## Camera

RTS camera with constrained pitch, smooth zoom between bounds, optional rotation, edge scroll and map bounds. Camera shake (respecting the reduced-motion setting) for big explosions only.

## Performance tooling

- The performance overlay shows FPS, frame time, draw calls, instance counts, sim tick time and ping.
- A browser benchmark scene (300 units fighting on a large map) runs via Playwright nightly and tracks frame time over time. See [testing.md](testing.md).
