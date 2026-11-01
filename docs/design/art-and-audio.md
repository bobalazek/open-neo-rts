# Art, graphics and audio

## Art direction

A **blocky, toy-brick** world: armies, buildings and terrain built from chunky bricks and voxels, like a tabletop battle with brick-built toys.

- **Units** are brick-built, with exaggerated proportions. Infantry are small chunky figures; tanks, aircraft and buildings are assembled from visible bricks. Roles read from the silhouette at RTS zoom.
- **Faction colours** are bright and saturated on large surfaces. Team colour comes from material slots (`team`, `team_dark`, `team_light`, `team_emissive`): a red team gets red panels, darker red trim and red glowing lights, while metal, glass and fixed palette parts keep their colours. Any unit works in any team colour.
- **Terrain** is built from discrete height levels connected by ramps, with tiled ground surfaces. Height levels are real sim data (they drive pathing and high-ground vision), so what you see is exactly what the sim uses.
- **Destruction:** units and buildings break apart into bricks. Wrecks are brick piles, which is also what **salvage** collects.
- **VFX** are cube particles: muzzle flashes, brick-chunk explosions, smoke puffs and tracer lines.
- **Lighting:** a soft sun with gentle shadows and ambient occlusion, giving a toy-diorama feel. A subtle tilt-shift depth of field is available on the high presets.
- **Readability first:** selection rings, health bars, clear projectile tracers, and team colour always visible.

Asset formats and budgets are in [assets.md](../contributing/assets.md).

## Graphics

- **Renderer:** Babylon.js, WebGPU first, with a WebGL 2 fallback chosen automatically or in settings.
- **Cheap by construction:**
  - one shared palette material per pack;
  - instanced meshes per unit type;
  - part animation for vehicles and baked vertex animation textures for skinned infantry, so hundreds of units animate cheaply.
- **Fog** is rendered from the seat's fog grid; see [fog-of-war.md](fog-of-war.md).
- **Target:** 60 fps at the medium preset with 300 units on a mid-range machine.

| Preset | Shadows                    | Ambient occlusion | Effects        | Post-processing            | Resolution scale |
| ------ | -------------------------- | ----------------- | -------------- | -------------------------- | ---------------- |
| Low    | Off (blob shadows)         | Off               | Reduced        | None                       | 75%              |
| Medium | Sun, low resolution        | Off               | Full           | Colour grading             | 100%             |
| High   | Sun, high resolution       | On                | Full           | Grading, bloom             | 100%             |
| Ultra  | Sun, high resolution, soft | On, high quality  | Full and dense | Grading, bloom, tilt-shift | 100%+            |

## Audio

- **Direction:** punchy, satisfying, slightly toy-like. Weapons have weight, and construction has clicky brick-snapping sounds. Each faction has its own music identity.
- **Mixer buses:** master → music, effects (weapons, impacts, movement), unit voices, announcer, UI, ambience. Each bus has its own volume setting.
- **Unit voices:** acknowledgements on select, move and attack, with variations and a cooldown so spam-clicking doesn't spam audio.
- **Announcer:** event lines ("unit ready", "base under attack", "construction complete") with priorities and throttling. Every line is mirrored in the notification feed and subtitles.
- **Spatial audio** via Babylon's audio engine (Web Audio): positional sounds relative to the camera, distance culling, and per-sound concurrency limits (e.g. at most N simultaneous gunshots of one type) with priorities.
- **Music** has menu, calm and battle states, crossfading on combat intensity.
- Sounds are triggered by sim events in the presentation layer and are never part of the sim. Clients only receive events they're allowed to see, so the fog rules apply to sound automatically.
