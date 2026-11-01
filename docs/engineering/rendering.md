# Rendering

`packages/render`, on Babylon.js. The renderer reads presentation snapshots from the sim and never writes to it. Art direction and graphics presets are in [art-and-audio.md](../design/art-and-audio.md).

## Terrain inspection

The terrain view at `/` or `/debug` loads the selected built-in map's authored dimensions and `.r8` layers. The Map picker links to `?map=core.map:sandbox-flat` and the other sandbox maps or Training Grounds. Layer downloads, lengths and terrain values are checked before rendering; a failed map keeps the picker available with an error. The renderer receives a parsed grid and owns no content loading or simulation state. Its returned `dispose()` releases the scene, engine, render loop and resize handler.

The built-in registry in `client/features/debug/maps.ts` is temporary until phase-2 pack loading. Binary layers use [Bun's asset imports](https://bun.sh/docs/bundler#assets), so both the HTML dev server and production build serve the original map bytes. The client also resolves original map decoration and resource GLBs; their static instances are separate from simulation entities.

## Graphics quality

`createRenderer(canvas, { terrain, quality: "medium" })` defaults to medium. The debug/performance harness can call `renderer.setQuality("low" | "medium" | "high" | "ultra", tiltShift?)` at runtime. Tilt-shift is optional and applies only to Ultra; pass `true` to enable the subtle depth-of-field effect, focused at the RTS camera target. No preference persistence or settings UI is included.

Low renders at 75% of the normal canvas resolution, with flat per-model blob shadows and no postprocessing. Medium uses a 1024-pixel directional sun shadow map and mild contrast grading. High uses 2048-pixel sun shadows, half-resolution SSAO2 (8 samples), grading and bloom. Ultra keeps 100% resolution, adds filtered soft sun shadows, full-resolution SSAO2 (16 samples and expensive blur), and the optional depth of field. SSAO is omitted on engines without Babylon's SSAO2 support. Particle density settings await the effects system; these presets do not claim to implement particles.

Terrain and visible model instances explicitly register as casters/receivers. Hidden shared GLB templates, water and selection overlays never enter the shadow render list. Babylon instances receive shadows through their shared source mesh but cast through their visible instances. Registration follows asynchronous model creation and disposal. Low's blobs follow model roots on a flat local plane; they are a cheap fallback rather than projected terrain shadows. Terrain materials remain unfrozen so shadow, prepass and depth shader variants can change safely. Preset replacement releases shadow maps, postprocess pipelines, AO prepass and optional depth-renderer resources. The isolated model preview retains its neutral scene and does not use match presets.
### Water and shoreline foam

Water chunks share an original 64×64 procedural ripple texture. A second scrolling texture breaks up
feathered foam strips on the wet side of dry cardinal neighbours. Shallow/deep transitions and the
interior of a ford receive no shore foam. The 8-cell border repeats authored edge cells, so a sea
continues across the map edge without an invented foam boundary. Texture coordinates use world
positions across chunks. Water stays at the existing `waterHeight`; this is surface detail, not wave
displacement or simulated flow.

`createTerrain` creates the two textures and one render observer only when water exists. Disposing
its returned root releases that observer, the textures and its materials as well as child meshes;
replacing it with dry terrain leaves no water resources. Foam meshes do not participate in picking.
Colours remain provisional with the existing biome palettes; this does not imply art-direction approval.

## Static map art

`createMapPresentation(scene, grid, placements, resolveModel)` owns static art and its templates. Placements retain original definition references and authored centre coordinates in cells; one cell is 2 metres, quarter-turn rotations apply to the original model, and height follows the terrain/ramp plane at that centre. The client resolves only registered built-in GLBs. Each model loads once per map view and rigid instances share geometry/materials. Instances are not pickable. Dispose this layer before the scene; failed or superseded loads release their assets, and errors identify the model.

The terrain client draws only props with `blocks: nothing`. Blocking props and non-prop map objects are reserved for authoritative entity projection, so this static path cannot duplicate them. Unknown prop references fail visibly. All current built-in maps have empty `objects` arrays; Sandbox: Resources and Training Grounds visibly demonstrate their existing fields.

`resourceInstances` turns an authored ore radius into a visual disc: integer cell indices within the radius receive one original ore-cell model at their cell centre, matching the existing map-preview rasterization, clipped to map bounds and deduplicated where fields overlap. An omitted radius defaults to one cell, matching the preview; an explicit zero marks the containing cell. Quarter-turn variation is a stable hash of map identity, visual seed (zero in the terrain view) and cell coordinates. Material markers retain their exact authored centre and 2×2 footprint. Only `stage_full` is enabled; field amounts do not imply depletion or per-cell caps. The existing schema authors ore/materials only, so the original oil-well asset remains unused until the owner resolves node policy. No harvesting, collision, destruction, node-bound structures, simulation changes or art-direction approval is implied.

## Asset inspection

`/debug?models=1` loads a local GLB into an isolated presentation scene. The first-party `@babylonjs/loaders` package is pinned to the same version as Babylon core: glTF parsing is infrastructure, so this uses Babylon's importer rather than a second model loader. Loaders register lazily. Each loaded asset owns its materials; recolouring one cannot affect another. `team_dark` and `team_light` apply the same sRGB tints as the brick builder, then convert to linear colour for PBR materials; `team_emissive` changes both albedo and emission.

The preview plays named animation groups and restores authored node transforms when returning to rest. Replacing or disposing an asset releases its meshes, materials and clips. Requests superseded by another file selection are disposed. This single-model inspection path does not implement the match's thin-instance renderer or mutate simulation state.

## Phase-1b entity presentation

`createEntityPresentation(scene, terrain, resolveModel)` consumes only copied `SeatSnapshot` values. The caller resolves a definition ID to `{ bytes, movementDomain }`, using the existing content domain or `null` for structures. This layer owns no pack catalog or simulation. Set Force colours with `setForceColor(force, "#RRGGBB")`; call `accept(snapshot, receivedAtMs)` on delivery and `render(nowMs)` each frame, using the same monotonic clock. Await or handle the promise from `accept` to report model-loading errors. Dispose the layer before its scene.

Accepted ticks increase monotonically; stale and repeated ticks are ignored. A new match or timeline reset needs a new presentation layer. Poses interpolate from the preceding accepted snapshot to the current one over the elapsed ticks × 50 ms, clamped at both ends. New entities appear at their current pose. Handles absent from the current projection are removed immediately, with no inferred death event. Definition or Force changes replace the instance, and superseded asynchronous imports are released.

Debug time controls use a monotonic presentation clock measured in simulation milliseconds, with its rate changed only by acknowledged worker pause/speed state. `setPlaybackRate(speed)` scales authored clips; zero freezes clips and snaps to the current authoritative pose for inspection and single-step. The same clock feeds snapshot acceptance and frame rendering, so ×0.25…×8 also scales the interpolation interval.

One subcell becomes 2/1,024 metres. Map x/y become world x/z; binary facing zero points east (+x), while authored models face +Z. Grounded models follow terrain tops and ramp planes; naval models use the existing water surface. The snapshot supplies no altitude, so aircraft currently follow terrain height until authoritative elevation is available. Structures play `idle` when authored; activity, attacks and deaths require presentation events absent from the current contract.

Rigid model parts use Babylon hardware instances, sharing one geometry/material template per (definition, Force). Each entity owns its transform hierarchy and animation groups, so its idle/move clip can run independently. Actual position changes select `move`; otherwise `idle` or rest. Force recolouring changes only team slots. Morph or skinned meshes use Babylon's shared-geometry clone path with independent animation state; vertex animation textures and cross-Force thin instancing remain later work. Templates are released when their last projected entity leaves. The isolated model preview shares the self-contained GLB loader and rest-pose playback code.

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
