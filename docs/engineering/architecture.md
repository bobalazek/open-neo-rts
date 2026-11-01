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
| UI                                             | React 19 + wouter (router, ~2 KB) + Zustand (UI state); no meta-framework (§2.1)                                          |
| Assets                                         | glTF / GLB, authored in Blender                                                                                           |
| Multiplayer sessions                           | Colyseus (rooms, lobby, matchmaking, reconnect) over WebSocket; match state uses our own protocol (§8)                    |
| Desktop                                        | Tauri 2 shell around the same web build                                                                                   |

### 2.1 Why no Next.js, Remix or similar

The client is a **single-page game**: a full-screen canvas with a React overlay. It needs no server rendering, no SEO, and no server-side data loading. Content packs are static files, and live data arrives over WebSocket from the separate match server.

- A meta-framework (Next.js, Remix/React Router framework mode) adds a server runtime, server rendering and routing conventions for pages and data. We'd use none of it, and fight it, because the canvas and the sim worker are client-only.
- The Tauri desktop shell (and a later mobile shell) needs a **static build**. A plain SPA gives that for free.
- The match server is a long-running Bun process holding game rooms over WebSocket (Colyseus). That's a different job from a web framework's request/response server, and it stays separate.

So the client is React 19 for screens and HUD, **wouter** for the handful of routes (deep links like `/lobby/:code` and `/debug`), **Zustand** for UI state, and Bun's built-in bundler and dev server. If a public website (news, wiki) is ever needed, it's a separate static site, not part of the game client.

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

**Principle: logic lives in packages; apps are thin shells.** An app only wires packages to a runtime: a browser page, a server process, a command line, and later a desktop or mobile window. That way, the web, desktop and mobile builds share one client, and every piece of logic can be tested without its app.

```text
open-neo-rts/
├── apps/                          thin shells: wiring only, no game logic
│   ├── web/                       browser page: mounts packages/client
│   ├── server/                    server process: starts packages/server
│   ├── cli/                       `bun neo <command>`: dev and CI tools
│   ├── desktop/                   Tauri 2 shell around the web build (planned)
│   └── mobile/                    mobile shell (planned)
├── packages/
│   ├── deterministic/             integer math, trig tables, PRNG, hashing
│   │   └── src/{random,math,trig,hash}/
│   ├── content/                   content types, pack loader, engine vocabulary, locales, maps, validators
│   │   └── src/{loader,schemas,rules,locales,maps,assets}/
│   ├── sim/                       the deterministic simulation
│   │   └── src/
│   │       ├── match.ts           setup, simulation version, fixed feature registration
│   │       ├── match-map.ts       integer static map input, validation, canonical serialization
│   │       ├── kernel/            world, phase scheduler and hooks, tick
│   │       ├── commands/          envelopes, canonical order, validation
│   │       ├── ecs/               our ECS
│   │       ├── physics/           collision, line traces, projectiles
│   │       ├── projection/        what each seat may see
│   │       ├── snapshots/         serialization, migrations, checkpoints
│   │       ├── testing/           fixtures (@open-neo-rts/sim/testing)
│   │       └── features/          entities, movement, combat, projectiles, construction,
│   │                              production, economy, vision, victory, control, research,
│   │                              abilities, salvage, events, scenarios, diplomacy, territory
│   ├── ai/                        bot players
│   │   └── src/features/          economy, production, combat, scouting, expansion,
│   │                              diplomacy, path-planning
│   ├── net/                       wire protocol and transport
│   │   └── src/{protocol,encoding,client,server}/
│   ├── render/                    Babylon.js renderer
│   │   └── src/{scene,camera,terrain,units,structures,effects,fog,overlays}/
│   ├── client/                    the game client: screens, HUD, input, editors
│   │   └── src/
│   │       ├── app/               router, screen composition, UI state
│   │       ├── worker/            single-player sim host (Web Worker)
│   │       ├── shared/            UI primitives
│   │       └── features/          main-menu, skirmish, match, debug, in-game-menu, post-match,
│   │                              settings, load-game, replays, content-editor, field-manual,
│   │                              multiplayer, lobby, campaign, map-editor, onboarding
│   └── server/                    the match server: rooms, lobby, match hosting
│       └── src/{rooms,match-host,matchmaking,presence,voice}/
├── content/                       game data (see content-format.md)
│   ├── schemas/                   generated from packages/content
│   └── core/                      the base game: factions/<faction>/{units,structures}/<name>/,
│                                  neutral/structures/<name>/, maps/
├── tools/biome/                   lint plugin enforcing the determinism rules
├── docs/                          design, engineering, contributing
└── .github/                       PR template and CI workflow
```

Every folder named in the tree, and every feature under a `features/` folder, has an `index.ts` stating its purpose and phase; most are still empty. The exceptions are `content/src/rules/` (engine vocabulary: roles, armour classes, resources, terrain, match settings) and `content/src/assets/` (model checks), whose files the package index exports directly. The [roadmap](../project/roadmap.md#what-each-phase-builds) says which ones get filled when.

The CLI's `bun neo run <scenario> [--seed N] [--ticks T]` reads a versioned command log, runs it twice in one process and prints checkpoint hashes. Parsing and execution are shared, runtime-independent exports of `packages/sim`; file I/O, options and output stay in `apps/cli`. See [testing.md](testing.md#2-determinism-harness).

### Why each package exists

| Package         | Why it's separate                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deterministic` | Everything that must give identical results on every engine, in one small, heavily tested place. Used by `content` (exact unit conversion), `sim` and `ai`                                                                  |
| `content`       | Loading and validating packs is needed by the client, the server, the CLI and the editors. It must not depend on the sim, so tools can validate content without running a match                                             |
| `sim`           | The game rules. It runs on the server, in the browser worker and in the CLI, so it can't touch the DOM, the network or the renderer. The ECS, physics and projection live inside it because nothing else uses them directly |
| `ai`            | Bots are a big, separate concern that only talks to the sim through commands and observations. Being a package makes "the AI can't cheat" a dependency rule, not a promise. Its version is part of the sim version          |
| `net`           | The wire protocol is shared by the client and the server and must match on both sides                                                                                                                                       |
| `render`        | Babylon.js stays out of everything else. The renderer reads the sim's projection and never writes it, which the dependency direction enforces                                                                               |
| `client`        | The whole game client (screens, HUD, input, single-player worker, editors) in one place, so web, desktop and mobile shells reuse it unchanged                                                                               |
| `server`        | The match server's logic (rooms, lobby, match hosting, presence), testable without starting a process                                                                                                                       |

### Why the apps are separate

| App      | Why                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web`    | The static build for browsers. Also the build that the desktop and mobile shells wrap                                                                            |
| `server` | A long-running process with its own deployment and scaling (§8). Players never download it                                                                       |
| `cli`    | Developer and CI tools (`bun neo validate`, `generate-schemas`, `make-placeholders`, `run`, `bench`, and later `replay`, `ai-vs-ai`). Same packages, no graphics |

## 4. Module dependency direction

```text
deterministic ◄── content ◄── sim ◄── ai
                                ▲  ◄── net ◄──┐
                                ▲  ◄── render ◄┤
                                └──────────── client ◄── apps/web
                    sim, ai, content, net ◄── server ◄── apps/server
                      sim, ai, content ◄──────────────── apps/cli
```

- **Allowed:** `content → deterministic`; `sim → deterministic + content`; `ai → sim + deterministic`; `net → sim`; `render → sim`; `client → render + sim + net + content + ai + deterministic`; `server → sim + net + content + ai`; each app → the packages it wires.
- **Forbidden:** `sim → Babylon / React / WebSocket / Date / DOM`; `content → sim`; `render → mutating sim state`; `ai → net or server`; any package → an app; apps → each other.

Boundaries are enforced by declared dependencies (Bun's isolated installs reject undeclared imports) and by the TypeScript `lib` and `types` each package compiles with. Inside a package, each folder exports an `index.ts` with its public contract. ECS components stay next to the feature that owns them, not in one shared `components/` folder.

## 5. Determinism contract

`SIM_VERSION` is exported from `packages/sim` and is 5. `MatchSetup` supplies an explicit map, the u32 seed, debug flag, declared Forces (index and faction ID), player/bot seat indices, grants and an ordered definition table in integer sim units. Seat 0 is reserved for system commands. `createMatch(setup)` validates and freezes a private copy of the map before registering entities, then movement, in that fixed order. `kernel.map` holds static terrain/spawn/object input; it creates no ECS entities. Spawn placement and map navigation use this map and original definition metadata. Routes and incremental search continuation participate in canonical hashes. Earlier simulation versions are rejected by the scenario parser. See [the current scenario contract](testing.md#map-aware-command-log-format-version-2).

- Exactly one `step(world, validatedCommands)` per **fixed 50 ms tick (20 Hz)** initially. The tick counter is an integer; the rendering frame rate is independent of it.
- Only sim commands change game state. A command envelope carries `matchId, playerId, seatId, requestId, requestedTick, sequence, payload`. The server chooses the canonical target tick and order; `requestedTick` is only a hint.
- Accepted commands are sorted stably by `(targetTick, serverSequence)`. The client's `sequence` is used only for deduplication within a connection.
- A refused command gets a rejection code, never a silent drop ([`REJECTIONS`](../../packages/sim/src/commands/index.ts)):
  - `malformed`: not `{ tick, seat, sequence, type, payload }` with non-negative int32 tick, seat and sequence;
  - `unknown_type`: no command has this type;
  - `debug_only`: a `debug.*` command in a match not started with `debug: true`;
  - `bad_payload`: payload fields missing, unexpected, not integers, or out of range for the type;
  - `duplicate`: another command has the same tick and sequence, so all of them are rejected;
  - `no_grant`: the seat holds no grant with that scope on that Force at that tick.
- Entity creation, lifecycle phases, queries, AI decisions and events all run in a fixed order. Any iteration over hashed structures is normalized wherever order affects outcomes.
- Gameplay values are integers: coordinates, health, resources, angles, cooldowns. Rendering converts them to floats. Units, ranges, overflow limits, rounding, trig and square roots are specified in [numerics.md](numerics.md).
- Each subsystem gets its own seeded PRNG stream, and PRNG state is part of snapshots and hashes. No `Math.random`, `Date.now`, `performance.now` or GPU readbacks in game rules.
- No floating point and no transcendental `Math` functions in game rules, with **no exceptions**: they differ between JS engines, and the server (Bun) and clients (browsers) run different engines. No unstable sort ties and no engine-dependent broadphase order. See [numerics.md](numerics.md).
- Entity IDs are stable across replays and snapshots. ECS-internal slot recycling never leaks into serialized IDs. Clients never see raw entity IDs: the visibility projection gives each seat **opaque per-seat handles**, so ID sequences can't reveal enemy production.
- The canonical state hash uses sorted keys and entity arrays and a versioned schema, and is computed at checkpoints (every 100 ticks and at match end), not every tick. It excludes interpolation, particles, local selection and UI state.
- A developer-only event log (`tick, source, command, result`) is used to locate the first divergence.
- **Server-originated changes are commands too.** Bot takeover and handback, kicks, surrender-on-timeout, pause and unpause, and grant changes are issued as canonical commands from a reserved **system seat**, so they appear in the command log and replays reproduce them.
- **The AI is part of the simulation version.** Bots run inside the tick, so any change to `packages/ai` that alters decisions bumps the simulation version, exactly like a sim change.
- **At the entity cap,** spawning follows a fixed rule: the oldest wreck is removed first; if the cap is still reached, new projectiles resolve as `instant` and new units wait in their production queue.

**Tick phase order (draft):** ingest commands → permission/placement validation → diplomacy/control changes → AI decisions for next tick → economy/production/research → navigation/movement → acquisition/projectiles/combat → destruction/territory/fog → objectives/victory → snapshot events (hash at checkpoints).

The order is a versioned contract: changing a phase bumps the simulation version. AI commands are queued for the **next** tick, never executed in the same phase. The AI phase observes the fog projection from the end of the previous tick.

**Registration, not imports:** the sim exposes a phase scheduler with hooks. Features (`register(world)`) and controllers such as bots (`registerController(world, seat, controller)`) plug into it, so `ai` depends on `sim` and never the other way round.

### Offline worker foundation (phase 1b)

`createOfflineMatch(onState)` in `client/worker` owns one module Web Worker served at `/sim-worker.js`. Its `init({ setup, seat, mode })` uses the map-aware `MatchSetup` and scenario validator. The worker owns the kernel, assigns canonical tick/sequence/seat, resolves presentation handles to ECS IDs, and executes through `step`. Only copied presentation packets cross back to the main thread: tick, definition ID, owner Force, integer transform, current/max health and current move order. The main-thread lifecycle module has no runtime sim import.

`controlled` projection currently exposes only Forces on which that seat has an active `unit.orders` grant. Unknown seats fail closed. This is a restrictive foundation, not phase-2 fog, shared vision, shroud or ghost memory. `debug-no-fog` explicitly exposes the entire world and current full-state hash, and requires `debug: true`. Each projection allocates its own opaque handles independently of ECS IDs; commands referencing unavailable handles are rejected.

Matches start paused. `command(type, payload)` accepts presentation handles in `entity`/`entities` and resolves after its next tick, so queue it before awaiting `step()` while paused. `pause`, `step` and `speed` (×0.25, ×0.5, ×1, ×2, ×4, ×8) control only the worker's real-time 50 ms pacing; simulation arithmetic remains unchanged. `exportLog()` is debug-only and returns the existing scenario envelope with accepted canonical commands; supply the current snapshot tick to `bun neo run --ticks` to reproduce trailing empty ticks. `dispose()` terminates the worker and rejects pending requests; reload creates a new host, preventing old replies from reaching the replacement.

Bun 1.3.9 serves an explicitly browser-bundled worker route in `apps/web/dev.ts`; `apps/web/build.ts` emits the same entry as a separate `dist/sim-worker.js`. This follows Bun's [HTML route](https://bun.sh/docs/runtime/http/server) and [build API](https://bun.sh/docs/bundler) patterns. The sim worker is not a copied TypeScript source asset. Terrain-aware initialization, renderer consumption and debug UI controls remain separate tasks.

## 6. ECS conventions

The ECS holds simulation objects: entities, components, queries and systems. Definitions such as `unit:alliance-of-free-nations/panther-mbt` are data templates that spawn entities with component values. Game units are not TypeScript classes. Entity IDs are u32 values starting at 1 (0 means "none" in fields), never reused within a world, and the next ID is part of snapshots.

Components include `Transform`, `OwnerForce`, `Health`, `Armor`, `MoveIntent`, `MoveCapability`, `WeaponSlots`, `Turret`, `ProductionQueue`, `HarvestState`, `Vision`, `Stealth`, `InfluenceEmitter`, `Garrison`. A tank is `MoveCapability(tracked) + Turret + Armor + WeaponSlots`; infantry uses different components. Buildings are entities too, usually with `Footprint, Health, PowerNode, ProductionQueue, ResearchProvider` or other combinations.

The ECS is ours (no bitECS). High-frequency numeric components use typed-array struct-of-arrays storage. Variable-length queues and dynamic state live in deterministic, feature-managed tables keyed by stable entity IDs, with explicit serialization. Benchmark the store against a simple sparse-set baseline early. The ECS API is internal and is never exposed as the public mod API.

Each match, editor preview, test and replay creates its own isolated world. World state and all subsystem registries belong to the match instance, never to global singletons. Component serialization is versioned.

## 7. Movement, navigation and physics

Terrain is a heightfield: a 2.5D authoritative world shown in 3D. Navigation has one grid per movement domain (the list is in [pathfinding.md](pathfinding.md#navigation-data)). The first pathfinding approach is a deterministic grid or hierarchical graph; large armies later need sector routes, formation planning and local avoidance. Define clearance and footprints, slope, terrain cost and obstacle occupancy. New buildings update the affected nav regions at tick boundaries.

Fixed-wing aircraft use an airborne controller with turn radius, altitude band, attack runs and landing. Rotorcraft hover and strafe. Ground units follow the terrain. Path requests have a canonical budget and tie-breaking.

`sim/src/physics` provides deterministic line traces, broadphase, and projectile integrators for `bullet`, `arc`, `grenade`, `missile` and `dropped` projectiles ([combat-and-balance.md](../design/combat-and-balance.md)). `instant` and `beam` shots resolve as line traces within a tick, with clearly defined scatter and cover. Tanks rotate hull and turret separately.

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

Performance targets on a mid-range desktop browser at the medium preset: **60 fps with 300 mobile units on screen**, and **30+ fps with 1,000 mobile units in the match** (e.g. 8 Forces at the 150 population cap that applies with 5 or more Forces, [match-rules.md](../design/match-rules.md#settings)). Lobby settings that can exceed this (higher caps, more Forces) show a performance warning in Advanced rules. The sim must hold 20 Hz at 1,000 units on the server and in the Web Worker. The renderer instances repeated meshes, batches animations and effects, culls by frustum and occlusion, and offers graphics-quality presets. Offline, the simulation runs in a Web Worker; online, on the server. AI planning and pathfinding have per-tick budgets counted in work units (never milliseconds, which would break determinism); wall-clock time is only measured for profiling. Asset import validates dimensions, texture sizes, LODs, animation counts and material counts.

The desktop app is a **Tauri 2** shell (`apps/desktop`) around the same web build. It uses the system WebView: WebView2 on Windows, WKWebView on macOS and WebKitGTK on Linux. The renderer capability-detects WebGPU and falls back to WebGL 2 wherever the WebView lacks it. The desktop shell adds native file access for saves, replays, settings and mods, and can host a local match server for LAN games. Desktop releases come after web play works.
