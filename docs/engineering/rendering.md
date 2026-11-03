# Rendering

Normal-match fog presentation consumes permitted snapshot grids and ghosts only.
The fog owner copies and unions allowed grids into a texture shared by disposable
material hooks. A hard explored-cell mask keeps shroud dark; visible edges soften
within explored terrain, which provisionally renders at 35% brightness. Remembered
structures use frozen gray, shadowless, non-pickable original models. The client
prunes absent live handles from geometry and selection before loading replacements.
Group changes, reloads and disposal invalidate late model requests and release
owned textures/ghosts/hooks. The explicit `/debug?fog=1` fixture demonstrates this
without claiming the normal skirmish screen is already wired. Separate WebGPU
hardware qualification and full-match UI acceptance remain later checks.

`packages/render`, on Babylon.js. The renderer reads presentation snapshots from the sim and never writes to it. Art direction and graphics presets are in [art-and-audio.md](../design/art-and-audio.md).

## Terrain inspection

The terrain view at `/` or `/debug` loads the selected built-in map's authored dimensions and `.r8` layers. The Map picker links to `?map=core.map:sandbox-flat` and the other sandbox maps or Training Grounds. Layer downloads, lengths and terrain values are checked before rendering; a failed map keeps the picker available with an error. The renderer receives a parsed grid and owns no content loading or simulation state. Its returned `dispose()` releases the scene, engine, render loop and resize handler.

The built-in registry in `client/features/debug/maps.ts` is temporary until phase-2 pack loading. Binary layers use [Bun's asset imports](https://bun.sh/docs/bundler#assets), so both the HTML dev server and production build serve the original map bytes. The client also resolves original map decoration and resource GLBs; their static instances are separate from simulation entities.

## Graphics quality

`createRenderer(canvas, { terrain, quality: "medium" })` defaults to medium. The debug/performance harness can call `renderer.setQuality("low" | "medium" | "high" | "ultra", tiltShift?)` at runtime. Tilt-shift is optional and applies only to Ultra; pass `true` to enable the subtle depth-of-field effect, focused at the RTS camera target. No preference persistence or settings UI is included.

Low renders at 75% of the normal canvas resolution, with flat per-model blob shadows and no postprocessing. Medium uses a 1024-pixel directional sun shadow map and mild contrast grading. High uses 2048-pixel sun shadows, half-resolution SSAO2 (8 samples), grading and bloom. Ultra keeps 100% resolution, adds filtered soft sun shadows, full-resolution SSAO2 (16 samples and expensive blur), and the optional depth of field. SSAO is omitted on engines without Babylon's SSAO2 support. Particle density settings await the effects system; these presets do not claim to implement particles.

Medium's whole-map projection uses depth bias 0.004 and normal bias 0.08, calibrated against the
authored Sandbox Terrain and Training Grounds cliffs. The extra depth clearance removes grazing-angle
self-shadow triangles at 1024 pixels; it trades some contact precision for stability. High and Ultra
retain bias 0.001 and normal bias 0.04. All three retain terrain and visible-model cast shadows.

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

`resourceInstances` turns an authored ore radius into a visual disc: integer cell indices within the radius receive one original ore-cell model at their cell centre, matching the map-preview rasterization, clipped to map bounds and deduplicated where fields overlap. An omitted radius defaults to one cell; an explicit zero marks the containing cell. Quarter-turn variation is a stable hash of map identity, visual seed (zero in the terrain view) and cell coordinates. Material and oil markers retain their authored centres and 2×2/1×1 visual footprints. Their fixed grid anchors are separate from those visual pivots. In debug sessions, copied entity projections hide a bound node's marker while its extractor exists and restore it on removal. Only `stage_full` is enabled; amounts do not imply depletion or per-cell caps. Oil may omit an amount because its depletion policy is undecided. No harvesting, income or depletion simulation or art-direction approval is implied.

## Asset inspection

`/debug?models=1` loads a local GLB into an isolated presentation scene. The first-party `@babylonjs/loaders` package is pinned to the same version as Babylon core: glTF parsing is infrastructure, so this uses Babylon's importer rather than a second model loader. Loaders register lazily. Each loaded asset owns its materials; recolouring one cannot affect another. `team_dark` and `team_light` apply the same sRGB tints as the brick builder, then convert to linear colour for PBR materials; `team_emissive` changes both albedo and emission.

The preview plays named animation groups and restores authored node transforms when returning to rest. Replacing or disposing an asset releases its meshes, materials and clips. Requests superseded by another file selection are disposed. This single-model inspection path does not implement the match's thin-instance renderer or mutate simulation state.

Mode-capable assets author a non-looping `deploy` clip from the packed pose at zero to
the deployed pose at its end. Use separate pivots/channels for this stance, leaving
idle, movement, aim and recoil on their existing children. The original Dragon Tank
and Metamorphic APC use three seconds. Playback reserves the clip's genuinely moving
channels, discarding the brick exporter's unused rest holds, so base clips cannot
overwrite deployment and deployment cannot reset firing. Sampled groups pause before
seeking; zero speed alone can return them to frame zero during Babylon's animation pass.

The entity layer reads only public `deploy.active`, samples forward on deployment and
backward on packing, and holds the endpoint while idle/firing. Reversals retain the
current phase. A newly revealed unit starts at its current endpoint; asynchronous loads
catch up changes observed while loading. The existing simulation-millisecond presentation
clock controls progression and pause, without multiplying speed twice. Retained death
clips hold the last stance; fog removal/disposal still removes the instance. This adds
no simulation state, private cooldown dependency, inferred death or wreck lifecycle.

Successful production output publishes `productionExits`: a bounded, copied list
of already projected opaque producer handles, coalesced per producer/tick. No
queue contents, output type, cost or hidden actor handle is included. Blocked
exits, population/EMP/refusal and mere queue progress do not emit it; actual gift
output does. The stream is cosmetic, cleared each production tick, excluded from
controller observations and canonical hashes, and cannot affect unit output.

Paired authored `open`/`close` clips reserve their genuinely moving channels
separately from deployment and base activity. An observed exit opens the door,
holds it for one authored opening duration and closes it. Repeated output keeps
opening continuous, renews a hold or reverses closing. Pending imports retain
inter-exit spans until clip durations are known, then catch up without replaying
finished activity. Ghosts remain closed and inert; disappearance revokes the
instance. The existing simulation-millisecond clock controls pause/speed. Preview
clip selection/rest still works. These visual timings delay no gameplay output
and introduce no balance number; models without both clips remain inert.

## Phase-1b entity presentation

`createEntityPresentation(scene, terrain, resolveModel)` consumes only copied `SeatSnapshot` values. The caller resolves a definition ID to `{ bytes, movementDomain }`, using the existing content domain or `null` for structures. This layer owns no pack catalog or simulation. Set Force colours with `setForceColor(force, "#RRGGBB")`; call `accept(snapshot, receivedAtMs)` on delivery and `render(nowMs)` each frame, using the same monotonic clock. Await or handle the promise from `accept` to report model-loading errors. Dispose the layer before its scene.

Accepted ticks increase monotonically; stale and repeated ticks are ignored. A new match or timeline reset needs a new presentation layer. Poses interpolate from the preceding accepted snapshot to the current one over the elapsed ticks × 50 ms, clamped at both ends. New entities appear at their current pose. Handles absent from the current projection are removed immediately, with no inferred death event. Definition or Force changes replace the instance, and superseded asynchronous imports are released.

Debug time controls use a monotonic presentation clock measured in simulation milliseconds, with its rate changed only by acknowledged worker pause/speed state. `setPlaybackRate(speed)` scales authored clips; zero freezes clips and snaps to the current authoritative pose for inspection and single-step. The same clock feeds snapshot acceptance and frame rendering, so ×0.25…×8 also scales the interpolation interval.

One subcell becomes 2/1,024 metres. Map x/y become world x/z; binary facing zero points east (+x), while authored models face +Z. Grounded models follow terrain tops and ramp planes; naval models use the existing water surface. The snapshot supplies no altitude, so aircraft currently follow terrain height until authoritative elevation is available. Structures play `idle` when authored; activity, attacks and deaths require presentation events absent from the current contract.

Rigid model parts use Babylon hardware instances, sharing one geometry/material template per (definition, Force). Each entity owns its transform hierarchy and animation groups, so its idle/move clip can run independently. Actual position changes select `move`; otherwise `idle` or rest. Force recolouring changes only team slots. Morph or skinned meshes use Babylon's shared-geometry clone path with independent animation state; vertex animation textures and cross-Force thin instancing remain later work. Templates are released when their last projected entity leaves. The isolated model preview shares the self-contained GLB loader and rest-pose playback code.

Optional model LOD uses unambiguous, disjoint authored branches named `<node>` or `<node>_LOD0`
and `<node>_LOD1`. Only mesh visibility changes; parent transforms, sockets, team materials,
animation targets and independent morph/skin state stay in place. Authored hidden meshes remain
hidden. Both branches must contain geometry; missing, duplicate, overlapping or ambiguous pairs
retain their authored visibility. Unpaired parts retain their authored visibility at either distance. Author both
variants under the appropriate animated parent, or animate each variant explicitly: the renderer
does not invent animation channels for a distant branch.

**Addition — provisional engineering distance:** LOD1 is selected at 96 metres from the active
camera to the rendered entity origin. `presentation.setLodDistance(metres)` accepts a positive
distance; `Infinity` keeps near variants. With no active camera, near variants are selected. This
API is for the debug/performance harness; it does not add a preference or art-direction approval.
Babylon's existing bounds/frustum culling still decides which visible mesh instances enter the
colour pass. Offscreen entities and both LOD variants remain resident and keep their animation
state; this introduces no animation culling or new culling framework. Current original brick models
have no authored LOD1, so their triangle counts are unchanged. Frame cost and the phase exit scene
remain a separate measured gate.

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

- Terrain chunks use Babylon's native bounds/frustum culling and distance-selected mesh LOD. Only the
  chosen terrain mesh is drawn; offscreen colour chunks can still cast into the visible shadow map.
  Water and foam retain their original meshes and world-space texture continuity.
- Distant terrain merges 2×2 dry flat patches only when their level, surface, biome and one-cell halo
  match. Chunk perimeter cells, the map border, ramps, cliffs, shorelines and material transitions retain
  their original geometry. Merged patches retain the original boundary bevel height, so adjacent chunks
  can choose different levels without holes. Per-cell colour variation is averaged within a merged patch.
- **Addition — provisional engineering distances:** Low switches at 64 metres from the camera to the
  chunk centre, Medium at 96, High at 128 and Ultra at 160. `renderer.setQuality` updates both effects and
  terrain thresholds; a standalone terrain root also exposes `setQuality`. These are initial detail
  thresholds, not an art-direction or performance sign-off.
- Both near and distant terrain geometry stay resident. This reduces submitted triangles, not chunk draw calls,
  startup work or memory. Model LOD selection is described in the entity presentation section above.
- Entities in fog aren't sent to the client at all ([fog-of-war.md](../design/fog-of-war.md)), so they cost nothing.

## Construction and destruction

Live construction sites expose integer `constructionStage` from 0 to 100 (floored
percentage of actual quarter-work). Exact work and active-builder counts stay
private to build controllers. Completed structures omit the stage; a zero-time
or missing-progress site stays at zero until actual completion. Remembered sites
keep only the last observed stage, including through hidden progress/completion,
ownership changes or death. The renderer must not consult live hidden state.

Structures reveal from the ground in provisional 0.25 m brick layers using that
public stage. A [custom instance buffer](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/instances#custom-buffers)
holds each model's world-space cutoff and activation flag; original geometry and
Force materials stay shared. GLSL/WebGL and WGSL/WebGPU hooks discard unrevealed
fragments. Devices without hardware instancing use shared-geometry clones and
per-mesh uniforms. Completion disables clipping, including the final partial
layer, and removes the scaffold. Models without a known stage remain at zero
while their construction-site marker exists.

A gold wire scaffold encloses the declared footprint and full model height,
follows terrain and rotation, and provides a selectable site envelope even at
zero progress. Remembered scaffolds are grey and unpickable. Public stage supplies
the progress bar where exact private work is unavailable. No animation clock
advances building work. Partial models currently cast no shadow; registration
begins at completion, pending clipped depth-pass support. Site removal, cancellation,
fog revocation and disposal release the scaffold/material and model instance.

Canonical `snapshot.remains` rows own persistent wreck/rubble instances. The
catalog resolves their separate original `presentation.wreck` GLB rather than
loading the living model. All 84 required original non-foot-unit/structure remains
assets are present. Shared geometry/materials retain authored vertex colors and
neutral debris palettes; team slots, where provided, use the existing Force-color
path. Live model colors are independent.

Remains use the final public pose, rotated structure footprint and existing
terrain/water height rules, with no interpolation, idle/fire/door/deploy playback,
health bars, construction plugin or foundation. They appear only while their
canonical rows are projected. Cosmetic death playback remains separate; absence
of a live actor never manufactures a wreck. Removing a row releases its geometry
and picking immediately, including while an asset import is pending. Match reset,
rewind, vision-group changes and disposal follow the same ownership rules.

Picking compares actual live and remains hit distances; screen picking uses CSS
pixels, independently of backing-buffer resolution. Remains are valid context
targets but stay outside army and box selection. Manual builder clearance/value
and wreck restoration remain separate gameplay work.

Initial debris color readiness is still under investigation (2-21b3a): some
parallel browser captures show a white first sample, while later samples and
independent first-only Chromium/WebKit runs show correct original colors. Both
sets of evidence are retained. Functional rendering/picking/fog checks do not
establish unconditional first-frame visual readiness.

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

Phase 1b's offline debug session shows counters without a ping value. Frame time is the interval between the last two completed frames; FPS is its reciprocal, not an average or a GPU timer. Draw calls are Babylon's completed-frame count, including shadow passes. Scene instances count allocated Babylon mesh instances and thin instances across the scene (including map art and off-screen instances), not units or visible draw submissions. The panel refreshes twice a second. Worker step time measures the full `sim.step` wall time, including command ingestion/logging and periodic checkpoint work. It excludes subsequent projection, debug-publish hashing, transport and scheduling. The timing sample stays outside kernel state and is unavailable until the first step. Reload disposes the observers and clears the last session's samples.

Open `/debug?scene=terrain-200` or choose **Load 200-unit terrain scene**. This fixed setup uses the original Training Grounds 128×128 map and its authored height levels/ramps, seed 1, Medium graphics, and 200 Eastern Collective Dragon Tanks in four groups of 50. It starts paused at tick 2 after real spawn and move commands; **Run** sends each group toward the opposite corner base using worker pathfinding and projected transforms. The normal RTS camera starts at the map centre; pan/zoom changes visibility and therefore rendering cost. Reload repeats the setup and orders. The normal `/debug` entry remains empty. Initial setup links retain the scene; command-log exports preserve its actual commands.

These observations do not establish the 60 fps phase exit. Hardware, browser/build, viewport/camera, warmup, duration and sample distribution belong to the later performance capture. Headless browsers may use a software adapter; their smoke results establish correctness rather than hardware throughput. The larger navigation CLI benchmark and later nightly combat workload remain separate.

From a clean committed checkout, run `bun run --cwd apps/web capture:renderer` for the manual hardware capture. It builds minified app/worker artifacts with one read-only counter exposure, opens a disposable Chrome window, warms for 10 seconds and collects a nominal 30-second window. Leave the desktop unlocked and that window active. The fixed 1280×720, DPR-1 render buffer uses an explicit benchmark camera (radius 380, beta 0.7, target 128/0/128) to frame all 200 units; normal camera controls stop at radius 110. This is not a native-resolution or ordinary-camera result.

The command writes source/worker/asset hashes, sanitized hardware/display details, raw samples, canonical command export and before/after screenshots under `test-results/renderer-capture/`. Frame intervals, worker observations, actual unit displacement and one-second model-bound frustum samples share the completed-frame window. Containment samples do not prove continuous or unoccluded visibility. A verified hardware WebGPU adapter, unchanged Medium signature, foreground focus and awake/unlocked macOS probes are required; unknown conditions fail qualification. OS probes cover the endpoints only; browser focus/visibility events cover the window, but their response to an OS lock is unverified. Operator review must account for any intervening desktop change. CPU frame intervals are not GPU or presentation timestamps, and capture does not automatically approve the phase exit. Other operating systems require equivalent qualification probes first.

Use `bun run --cwd apps/web capture:renderer --diagnostic` only to check collection mechanics in headless Chrome. It does not wake the display and is always labeled ineligible for hardware acceptance. Neither mode changes authored scene commands, sim state, quality settings or production source. Disposable browser/server/power resources are released on completion or failure.

On macOS, lock qualification parses the native console-session property list: one on-console completed login is required before an omitted lock flag may mean unlocked. Native CoreGraphics active/asleep booleans establish main-display readiness. The first owner-confirmed foreground run and the omitted-field calibration are recorded in the [capture learning](../project/learnings/2026-11-02-foreground-renderer-capture.md); it measures 50.373 fps and does not pass the 60 fps exit.

Directional shadows use Babylon's full dynamic caster fit on every shadow-map refresh. Public target callbacks enable fitting before binding and retain that map's bounds afterward for receiver passes, avoiding a second full scan under Babylon's different render-phase ID. Readiness may query a transform early; the actual target render advances the render ID before fitting. Preset disposal restores the prior automatic-fit flag. A recreated target falls back to automatic fitting until the preset is reapplied. No fixed height envelope, caster reduction or preset change is involved.

For affine caster/view matrices, the public projection callback computes the same oriented-box extrema from each current bounding centre and its three transformed half-axes. Projective matrices retain the eight-corner calculation. One cache preserves the refreshed fit for receiver queries, including empty lists; fixed-frustum and depth-range behavior follow Babylon's reference. Existing custom projection callbacks and initially manual fitting are retained, and disposal restores the prior callback. Tests compare against Babylon's actual default projection across geometry updates, reflection/shear, depth modes, new/tall/moving casters and unprimed cache cases.
