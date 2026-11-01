# Technical architecture and feature-first monorepo

**Status:** proposed. Validate with spikes and decision records before locking dependencies.

## 1. Runtime picture

```text
 Browser (game + editor)                 Dedicated server (Bun)                CLI / tests
 ┌─────────────────────────┐            ┌─────────────────────────────┐      ┌──────────────────┐
 │ React menus, HUD, lobby │            │ Auth, lobby, admission      │      │ bun neo CLI      │
 │ Local input commands    │ ────────→  │ canonical command ordering  │      │ seeded scenarios │
 │ Babylon renderer        │ ←────────  │ authoritative ECS simulation│      │ replay/hash tests│
 │ visual effects/particles│ filtered   │ AI / victory / diplomacy    │      └────────┬─────────┘
 │ local presentation state│ deltas     │ visibility projection       │               │
 └────────────┬────────────┘            └────────────┬────────────────┘               │
              │                                      │                                │
              └────────────── shared definitions, validation, content ────────────────┘
```

Single-player runs the same simulation locally in a Web Worker. Offline play needs no remote authentication and no online service. The renderer may interpolate authoritative outputs but never mutates world state. The UI and editor may keep their own React state, and a separate non-authoritative ECS for gizmos and particles; neither ever changes the match simulation directly.

## 2. Stack and tooling

| Layer                                          | Choice                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Language                                       | TypeScript 7                                                                                                              |
| Runtime, package manager, test runner, bundler | Bun (client, server and CLI)                                                                                              |
| Monorepo                                       | Turborepo on Bun workspaces                                                                                               |
| Lint and format                                | Biome                                                                                                                     |
| Rendering                                      | Babylon.js, WebGPU with WebGL 2 fallback                                                                                  |
| ECS                                            | Our own (`packages/sim/src/ecs`)                                                                                          |
| Physics                                        | Our own deterministic gameplay physics (`packages/sim/src/physics`); visual-only effects may use Babylon's physics plugin |
| Pathfinding                                    | Our own, inside the sim (§7)                                                                                              |
| UI                                             | React (menus, HUD, lobby, editor panels)                                                                                  |
| Assets                                         | glTF / GLB, authored in Blender                                                                                           |
| Multiplayer sessions                           | Colyseus (rooms, lobby, matchmaking, reconnect) over WebSocket; match state uses our own protocol (§8)                    |
| Desktop                                        | Tauri 2 shell around the same web build                                                                                   |

### Build vs. use

**We use** big, general-purpose infrastructure that would take years to replicate: Bun, Turborepo, Biome, TypeScript, Babylon.js, React and Colyseus.

**We write** everything that defines how the game plays, plus small libraries that are cheaper to own than to adapt:

| Ours                                                                                       | Why we own it                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| ECS                                                                                        | Determinism, stable IDs, serialization and SoA layout are ours to control |
| Deterministic math, PRNG, hashing                                                          | Small, and correctness depends on it                                      |
| Physics (collision, line traces, projectiles)                                              | Must be lockstep-safe; general engines aren't                             |
| Pathfinding and navigation (grid A*, later hierarchical/flow fields, steering, formations) | Fixed tie-breaking and budgets are part of the determinism contract       |
| Fog of war and vision                                                                      | Feeds server visibility filtering                                         |
| AI                                                                                         | See [ai.md](ai.md)                                                        |
| Match protocol and delta encoding                                                          | Visibility-filtered, versioned, binary                                    |
| Content schemas and validation, map compiler                                               | Moddable data is the product                                              |

Add a third-party dependency only when it's infrastructure-sized, or clearly outside gameplay (e.g. a UI component), and record why in a decision record.

Commands: `bun run dev | build | typecheck | test | check | fix`.

Packages are source-only TypeScript (`exports` points to `src/index.ts`), so only apps have a build step. The simulation packages are compiled **without DOM types**, and Biome forbids `Date`, `performance`, timers and `crypto` in them.

## 3. Monorepo layout

**Apps are separate deployables:** `web` (static client), `server` (match server) and later `desktop` and `mobile` shells. Apps share packages but never import each other. The map editor is a feature of `web`, not its own app.

`[now]` marks folders that exist today (most packages are still empty stubs with their dependencies declared); everything else is the target layout. Folders inside a package are created when their first code lands.

```text
open-neo-rts/
├── apps/
│   ├── web/                         [now] game client: menus, match, map editor (`/editor`)
│   │   └── src/
│   │       ├── app/                   router, feature composition, providers
│   │       ├── features/
│   │       │   ├── main-menu/  single-player/  skirmish/  campaign/
│   │       │   ├── multiplayer/{lobby,matchmaking,reconnect}/
│   │       │   ├── match/{hud,controls,selection,camera,presentation}/
│   │       │   └── replays/  settings/  mods/
│   │       └── shared/                only truly cross-feature UI primitives
│   ├── cli/                         [now] `bun neo <command>`: validate-assets now; run, replay, bench, ai-vs-ai next
│   ├── server/                      [now] dedicated match server (Colyseus): identity, lobbies, matches, reconnect
│   ├── desktop/                       Tauri 2 shell around the web build              [later]
│   └── mobile/                        mobile shell                                     [later]
├── packages/
│   ├── deterministic/               [now] PRNG streams, fixed-point math, trig tables, stable sort, hashing
│   ├── sim/                         [now] deterministic headless simulation, no DOM/GPU
│   │   └── src/
│   │       ├── ecs/                 [now] our ECS: stable IDs, typed-array storage, queries, isolated worlds
│   │       ├── physics/             [now] collision, line traces, projectile integrators (integer math)
│   │       ├── projection/          [now] per-seat visibility projection (server and single player)
│   │       ├── kernel/                world, phase scheduler and hooks, tick
│   │       ├── commands/              canonical queue, validation
│   │       ├── features/              one folder per feature, components live with their feature
│   │       │   ├── entities/  movement/  combat/  projectiles/  construction/
│   │       │   ├── production/  economy/  research/  vision/  abilities/
│   │       │   ├── control/  diplomacy/  victory/  scenarios/  events/  salvage/
│   │       │   └── territory/                     optional rule module
│   │       ├── snapshots/             full state, migrations, replay checkpoints
│   │       └── testing/               fixtures and scripted bots, exported as @open-neo-rts/sim/testing
│   ├── ai/                          [now] bot players; registers into the sim's controller hook; see ai.md
│   ├── content/                     [now] definition types, schemas, pack loader, validators
│   │   └── src/maps/                [now] map format, compiler (nav, height levels), map validators
│   ├── net/                         [now] wire protocol, binary encoding, client and server transport
│   ├── render/                      [now] Babylon adapter: terrain, units, buildings, vfx, selection
│   └── mod-sdk/                       safe declarative authoring helpers                 [later]
├── content/                         [now] data only; see content/README.md
│   ├── schemas/                     [now] generated from packages/content
│   ├── profiles/{neo-2035,ancient-kingdoms,epoch-wars}/
│   ├── rulesets/{base-building,territorial-control,era-progression}/
│   ├── packs/official-2035/{factions,units,structures,weapons,abilities,research,locales,assets,source}/
│   ├── packs/example-mod/
│   ├── maps/{official,examples}/
│   └── campaigns/
├── docs/{design,engineering,contributing}/  [now]
├── .claude/skills/                  [now] agent skills (add-content, add-sim-feature)
├── .github/                         [now] PR template; CI and preview workflows later
├── AGENTS.md  CLAUDE.md             [now] agent rules
└── CONTRIBUTING.md                  [now]
```

`ancient-kingdoms` and `epoch-wars` are future profiles, not v1 commitments. Assets live in this repo under `content/packs/*/assets/`, stored with Git LFS, all original work; see [assets.md](../contributing/assets.md).

## 4. Module dependency direction

`deterministic` is the leaf package. Six packages in total: each has more than one consumer or a boundary worth enforcing (`ai` and `render` can't write sim state). Code with a single consumer lives inside that consumer as a folder (the ECS, physics and projection in `sim`; maps in `content`; UI components and editor logic in `apps/web`) and is extracted only when a second consumer appears.

- **Allowed:** `content → deterministic`, `sim → deterministic + content`, `ai → sim`, `net → sim`, `render → sim`, `apps/web → render + net`, `apps/server → sim + ai + content + net`, `apps/cli → sim + ai + content`.
- **Forbidden:** `sim → Babylon / React / WebSocket / Date / DOM`, `content → arbitrary installed plug-ins`, `render → mutating authoritative ECS`, `ai → server networking internals`.

Enforce boundaries with package exports and lint rules. Each feature exports an `index.ts` with its public contract. ECS components stay next to the feature that owns them, not in one shared `components/` folder. Shared kernel primitives exist only when something actually reuses them.

## 5. Determinism contract

- Exactly one `step(world, validatedCommands)` per **fixed 50 ms tick (20 Hz)** initially. The tick counter is an integer; the rendering frame rate is independent of it.
- Only sim commands change game state. A command envelope carries `matchId, playerId, seatId, requestId, requestedTick, sequence, payload`. The server chooses the canonical target tick and order; `requestedTick` is only a hint.
- Accepted commands are sorted stably by `(targetTick, serverSequence)`. The client's `sequence` is used only for deduplication within a connection.
- Entity creation, lifecycle phases, queries, AI decisions and events all run in a fixed order. Any iteration over hashed structures is normalized wherever order affects outcomes.
- Gameplay values are integers: coordinates, health, resources, angles, cooldowns. Rendering converts them to floats. Units, ranges, overflow limits, rounding, trig and square roots are specified in [numerics.md](numerics.md).
- Each subsystem gets its own seeded PRNG stream, and PRNG state is part of snapshots and hashes. No `Math.random`, `Date.now`, `performance.now` or GPU readbacks in game rules.
- No floating point and no transcendental `Math` functions in game rules, with **no exceptions**: they differ between JS engines, and the server (Bun) and clients (browsers) run different engines. No unstable sort ties and no engine-dependent broadphase order. See [numerics.md](numerics.md).
- Entity IDs are stable across replays and snapshots. ECS-internal slot recycling never leaks into serialized IDs. Clients never see raw entity IDs: the visibility projection gives each seat **opaque per-seat handles**, so ID sequences can't reveal enemy production.
- The canonical state hash uses sorted keys and entity arrays and a versioned schema, and is computed at checkpoints (every 100 ticks and at match end), not every tick. It excludes interpolation, particles, local selection and UI state.
- A developer-only event log (`tick, source, command, result`) is used to locate the first divergence.
- **Server-originated changes are commands too.** Bot takeover and handback, kicks, surrender-on-timeout, pause and unpause, and grant changes are issued as canonical commands from a reserved **system seat**, so they appear in the command log and replays reproduce them.
- **The AI is part of the simulation version.** Bots run inside the tick, so any change to `packages/ai` that alters decisions bumps the simulation version, exactly like a sim change.
- **At the entity cap,** spawning follows a fixed rule: the oldest wreck is removed first; if the cap is still reached, new projectiles resolve as hitscan and new units wait in their production queue.

**Tick phase order (draft):** ingest commands → permission/placement validation → diplomacy/control changes → AI decisions for next tick → economy/production/research → navigation/movement → acquisition/projectiles/combat → destruction/territory/fog → objectives/victory → snapshot events (hash at checkpoints).

The order is a versioned contract: changing a phase bumps the simulation version. AI commands are queued for the **next** tick, never executed in the same phase. The AI phase observes the fog projection from the end of the previous tick.

**Registration, not imports:** the sim exposes a phase scheduler with hooks. Features (`register(world)`) and controllers such as bots (`registerController(world, seat, controller)`) plug into it, so `ai` depends on `sim` and never the other way round.

## 6. ECS conventions

The ECS holds simulation objects: entities, components, queries and systems. Definitions such as `unit:panther` are data templates that spawn entities with component values. Game units are not TypeScript classes.

Components include `Transform`, `OwnerForce`, `Health`, `Armor`, `MoveIntent`, `MoveCapability`, `WeaponSlots`, `Turret`, `ProductionQueue`, `HarvestState`, `Vision`, `Stealth`, `InfluenceEmitter`, `Garrison`. A tank is `MoveCapability(tracked) + Turret + Armor + WeaponSlots`; infantry uses different components. Buildings are entities too, usually with `Footprint, Health, PowerNode, ProductionQueue, ResearchProvider` or other combinations.

The ECS is ours (no bitECS). High-frequency numeric components use typed-array struct-of-arrays storage. Variable-length queues and dynamic state live in deterministic, feature-managed tables keyed by stable entity IDs, with explicit serialization. Benchmark the store against a simple sparse-set baseline early. The ECS API is internal and is never exposed as the public mod API.

Each match, editor preview, test and replay creates its own isolated world. World state and all subsystem registries belong to the match instance, never to global singletons. Component serialization is versioned.

## 7. Movement, navigation and physics

Terrain is a heightfield: a 2.5D authoritative world shown in 3D. Navigation has several domains: foot, wheeled, tracked/heavy and air, and later water, amphibious and tunnelling. The first pathfinding approach is a deterministic grid or hierarchical graph; large armies later need sector routes, formation planning and local avoidance. Define clearance and footprints, slope, terrain cost and obstacle occupancy. New buildings update the affected nav regions at tick boundaries.

Fixed-wing aircraft use an airborne controller with turn radius, altitude band, attack runs and landing. Rotorcraft hover and strafe. Ground units follow the terrain. Path requests have a canonical budget and tie-breaking.

`sim/src/physics` provides deterministic line traces, broadphase, and projectile integrators for ballistic and homing projectiles. Hitscan resolves ray segments within a tick, with clearly defined scatter and cover. Tanks rotate hull and turret separately.

Debris, ragdolls and destruction visuals may use Babylon's physics plugin (or Jolt/Rapier) inside `render`, because they never feed back into the sim. Gameplay never depends on a third-party physics engine; any exception needs a decision record and must pass determinism, performance and networking gates.

## 8. Server and replication

The dedicated server owns lobby admission, the content/engine version handshake, permissions, command rate limits, world updates, AI, visibility filtering, snapshots, lobby lifecycle and results. It validates every action, including player-to-force permissions and post-defeat grants. Each match is one isolated simulation world. Replay logs and periodic snapshots are persisted; the first LAN/local prototype needs no database.

**Colyseus** (0.18, via its Bun transport `@colyseus/bun-websockets`) handles the session layer: rooms, lobby state, matchmaking, seat reservation and reconnection.

Match state does **not** go through Colyseus Schema state sync. The authoritative state lives in our ECS, and fog of war must come from the sim's own vision system. Mirroring that state into Schema would mean keeping two copies of the world and filtering visibility twice. Instead, the room hosts one sim world, receives commands as room messages, and sends each seat our own visibility-filtered snapshots and deltas (projection in `sim/src/projection`, encoding and transport in `packages/net`) as binary room messages. Colyseus Schema can still carry the lobby state, where everything is public anyway.

Never send hidden enemy state to a client just to simplify the renderer. That also covers side channels:
- clients get opaque per-seat entity handles, not raw IDs;
- command rejections caused by something the seat can't see use a generic code (`blocked`), never "hidden unit there";
- the pathing leak (paths bending around unseen structures) is accepted and documented.

**Process model:** each match runs its sim in its own **Bun Worker**. The Colyseus room thread only does I/O: it receives commands, forwards them to the worker, and sends the worker's per-seat projections. A heavy match therefore can't delay other rooms' messages. To be confirmed by the Colyseus spike in phase 3.

**Starting budgets** (targets to benchmark from phase 1 headless runs):

| Budget                            | Target                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Sim tick at 1,000 units, 8 Forces | ≤ 12 ms (so 40 ticks/s at "Faster" still leaves headroom)                                   |
| Per-seat projection               | ≤ 1 ms per seat per snapshot                                                                |
| Snapshot rate                     | 10 Hz deltas, plus reliable urgent events                                                   |
| Bandwidth per client              | ≤ 50 KB/s average at 1,000 visible units                                                    |
| Click to visible response         | ≤ 200 ms at 100 ms RTT (immediate local order indicator, then the server's acknowledgement) |
| Replay at 8× in a browser         | ≤ 6 ms per tick at the default population                                                   | Details are in [multiplayer.md](../design/multiplayer.md). |

## 9. Performance and deployment

Performance targets on a mid-range desktop browser at the medium preset: **60 fps with 300 mobile units on screen**, and **30+ fps with 1,000 mobile units in the match** (e.g. 5 Forces at the default 200 population cap). Lobby settings that can exceed this (higher caps, more Forces) show a performance warning in Advanced rules. The sim must hold 20 Hz at 1,000 units on the server and in the Web Worker. The renderer instances repeated meshes, batches animations and effects, culls by frustum and occlusion, and offers graphics-quality presets. Offline, the simulation runs in a Web Worker; online, on the server. AI planning and pathfinding have per-tick budgets counted in work units (never milliseconds, which would break determinism); wall-clock time is only measured for profiling. Asset import validates dimensions, texture sizes, LODs, animation counts and material counts.

The desktop app is a **Tauri 2** shell (`apps/desktop`) around the same web build. It uses the system WebView: WebView2 on Windows, WKWebView on macOS and WebKitGTK on Linux. The renderer capability-detects WebGPU and falls back to WebGL 2 wherever the WebView lacks it. The desktop shell adds native file access for saves, replays, settings and mods, and can host a local match server for LAN games. Desktop releases come after web play works.
