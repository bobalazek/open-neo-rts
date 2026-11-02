# Testing strategy

**Status:** proposed. It builds on the acceptance tests listed in [multiplayer.md](../design/multiplayer.md) §8 and [map-editor.md](map-editor.md) §10.

The game is only as trustworthy as its determinism. Most of the testing effort goes into proving that the same inputs produce the same state, everywhere.

## 1. Layers

| Layer            | What                                                                                                                                                                                                  | Where                                    | When                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------- |
| Unit             | Pure functions and systems: fixed-point math, PRNG, ECS store, pathfinding, damage                                                                                                                    | `*.test.ts` next to the code, `bun test` | Every commit                        |
| Determinism      | Same seed + command log → identical state hash at every checkpoint                                                                                                                                    | `apps/cli`, golden hashes in repo        | Every commit                        |
| Scenario         | Scripted matches with assertions: the multiplayer and map-editor acceptance tests                                                                                                                     | `apps/cli` + `sim/testing`               | Every commit                        |
| Fuzz             | Seeded random command streams: sim never throws, invariants hold, still deterministic                                                                                                                 | `apps/cli`                               | CI (short), nightly (long)          |
| Cross-platform   | The `packages/deterministic` golden digests and, as it grows, the determinism suite, run in Bun and in Chromium, Firefox and WebKit via Playwright                                                    | CI `browsers` job, `apps/web/e2e/`       | Every commit                        |
| AI-vs-AI         | Many seeds per matchup: win rates, match length, stalls                                                                                                                                               | `apps/cli`                               | Nightly; on balance changes         |
| Performance      | Tick cost for N units, pathfinding budgets, snapshot size                                                                                                                                             | `bun neo bench`                          | Nightly; tracked over time          |
| Network          | Simulated latency/loss/reconnect; **fog leak** checks that no payload ever contains entities the seat can't see                                                                                       | server integration tests                 | Every commit once the server exists |
| Content and maps | Schema validation, dependency resolution, map compile hash reproducible                                                                                                                               | `content` validators                     | Every commit                        |
| Client smoke     | Page loads, renderer starts (WebGPU and WebGL), no console errors                                                                                                                                     | Playwright                               | Every commit once there's UI        |
| End-to-end       | The real client and dev server in a browser: open [debug mode](../design/screens/debug-mode.md) on a sandbox map, spawn, give orders, and check the outcome through the projection and the state hash | Playwright, `apps/web/e2e/`              | Every commit once debug mode exists |

## 2. Determinism harness

- **Scenarios** are command logs plus setup (map, seed, Forces). They're written by hand, built with the `sim/testing` helpers, or exported from debug mode, so a bug found by clicking becomes a test.

- `bun neo run <scenario> [--seed N] [--ticks T]` produces a `tick hash` line every 100 ticks and at the final state, without repeating a final checkpoint. It runs twice in one process and exits nonzero if the checkpoint sequences differ. `--seed` overrides the setup seed without changing the file. `--ticks` is the final tick (number of steps): a command at tick 199 requires at least 200 steps. Without it, execution ends after the last command; an empty log ends at tick 0. A tick-0 command requires one step. Truncating the log is rejected.
- The minimal CLI fixture is `apps/cli/scenarios/smoke.json`. Its CLI tests exercise output and error handling. `parseScenario` and `runScenario`, exported from `@open-neo-rts/sim`, also work without Bun or browser APIs so later browser tests use the same runner.
- The current version-2 proof is `apps/cli/scenarios/eastern-collective-two-forces.json`: two Forces, each with the seven original tier-1 Eastern Collective units, moving, stopping and resuming through tick 10,000 on an explicit 8×8 terrain-input fixture. It includes plateaus, a ramp, water, surfaces, biomes and a static authored object. Positions in the original phase-1a script are scaled into the fixture; placement and map-aware movement are still separate work. Its 100 checkpoints live in `apps/cli/scenarios/__golden__/eastern-collective-two-forces.json`. Run it with `bun neo run apps/cli/scenarios/eastern-collective-two-forces.json`. The Bun test checks two runs in one process and two fresh CLI processes; the browser test checks two runs in each of Chromium, Firefox and WebKit against the same goldens. Both suites already run in CI's `verify` and `browsers` jobs. The original version-1 flat-world fixture and goldens remain in Git history; [CI run 41341002715](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) preserves that phase-1a proof. The current parser rejects them explicitly.
- `bun apps/cli/scenarios/generate-eastern-collective-two-forces.ts` regenerates that one scenario and its goldens from the hand-authored script and `sim/testing` fixtures. Review both files after regeneration; existing simulation outcome changes still require a simulation version bump.
- Golden hashes live next to scenarios. A sim change that alters outcomes must update the goldens **and** bump the simulation version.
- On mismatch, the harness reports the **first divergent tick** and diffs the canonical state at that tick, using the developer event log.
- Replay compatibility: replays record the sim version and content hash; old replays either replay exactly or are rejected clearly.
- Every determinism test runs the scenario twice in one process, too. That catches leaked global state between worlds.

### Map-aware command-log format (version 2)

The JSON envelope is `{ "format": 2, "simVersion": 18, "setup": { ... }, "commands": [ ... ] }`. `format` versions the file shape; `simVersion` must equal the exported `SIM_VERSION`. Unknown fields and malformed values are rejected with JSON paths. Logs from previous simulation versions are incompatible: there is no implicit migration. Re-author them with explicit map and placement metadata under the current simulation version and regenerate their goldens deliberately.

Optional `setup.normal` records the normal starting kit, content identity, selected
spawns/teams and resolved starting settings. Normal startup creates real entities
before tick zero; no debug commands appear in its initial log. The normal-start
tests retain fixed initial/two-tick checkpoint goldens for the authored Eastern
Collective kit on Training Grounds. Existing debug scenario state hashes remain
unchanged under SIM11; their version headers advance explicitly. A browser worker
journey also checks failed-init retry, the private seven-entity controlled view,
Bun/browser startup agreement, ordinary orders and debug/export refusal.

SIM11 appends real stock-bank entities after the starter entities, preserving
their IDs. Normal-start initial/two-tick goldens are `59224a8b433ff77c` and
`1314cf05d33bed96`. Bank operations participate in World serialization and hashes;
bank tests cover same-tick affordability, rejected mutations, grant lifetimes and
private projections. The worker journey checks the permitted 5,000-credit bank
and excludes the opposing bank.

SIM12 adds normal power state and site-marker registration. Normal-start goldens
are `6b57c6d06dca4510` initially and `36853bd25b4f04d0` at tick two; debug state
goldens stay unchanged. Power regressions cover exact capacity, brownout,
completion, producer loss, manual shutdown, ownership, permissions and copied
private views. The worker journey verifies private HQ supply and a real toggle.

SIM13 adds paid construction sites, pending clearance and builder assignments to
the normal World schema, and hashes all validated definitions with canonical
object-key order. Current normal-start goldens are `8f7c495caef2c4e5` initially
and `db9d1bda0947bc67` at tick
two. Focused checks cover rotated occupancy, the six/three-cell boundary, provider
ownership/completion, remote node exceptions, full atomic payment, competing
funds, once-only cancellation, destruction loss, clearance timeout and newer
orders, structure-cap races and unit-disc overlap at footprint boundaries. The
authored Industrial Reactor recipe is checked without changing its
balance values. Debug state goldens remain unchanged.

SIM14 adds canonical builder approach/progress state and an assistance command.
Normal-start goldens are `ae83e3fd8c458e31` initially and `05e88e9b90e1c8b8` at
tick two. Work checks cover actual arrival, assistance rates, leave/resume,
blocked retry, unreachable fallback, zero/max duration, deaths, large radii and
preserving newer orders during cleanup. The worker journey builds, stops,
resumes and completes an authored reactor, checks power activation and refuses
an unfinished-construction refund after completion. Debug state goldens remain
unchanged.

SIM15 adds independent resource-node lifetime and per-extractor integer work.
Normal-start goldens are `8257214c396e5970` initially and `d66fd6da6a662ec8` at
tick two. Focused checks cover exact yields, brownout/shutdown, finite/unlimited
nodes, ownership, rebuild/duplicate claims, overflow and private status. A worker
journey builds a real extractor using approved fixture balance, then checks
full/half/no output and finite depletion. Engine coverage is independent of the
separate authored balance activation. Raw ECS serialization is covered; executing
a restored kernel remains later save/restore acceptance. Debug hashes are unchanged.

SIM16 activates the owner's provisional extractor recipe/rates in actual content.
Authored compiler assertions check the 800-credit/400-tick recipe, both outputs
and existing builder availability. Normal-start fixture and debug state hashes
remain unchanged; their inputs do not use that newly activated recipe. Scenario
headers advance deliberately without manufacturing changed state goldens.

SIM17 adds production queues, receipts, once-only gifts and rallies to canonical
state. Normal-start goldens are `d04aa82330f93687` initially and
`8b8eeb750dda41f4` at tick two. Focused regressions cover parallel slots, FIFO
limits, competing starts in enqueue order, cancellation/death/refund overflow,
power, population, grants, rotated/radius-aware blocked exits, gifts and rallies.
The worker journey constructs a Barracks fixture, pays only active slots, cancels
queued/paid items, pauses work on power-off and produces a rallying soldier.
Actual authored production metadata activation is a separate faction change.
Debug state hashes remain unchanged.

SIM18 activates actual tier-1 producer exits and two Barracks slots. Normal-start
goldens become `591ee483e603a15d` initially and `e42e33c5cd6e2094` at tick two;
the starting headquarters now carries its authored exit. Compiler assertions
check exits, slots, produced units and the valid zero-population included truck.
The War Factory scenario metadata follows conversion; debug state hashes remain
unchanged. The synthetic 2×2 extractor fixture explicitly omits inherited 3×3
headquarters exits instead of weakening semantic validation.

`setup` contains:

- `map`: `{ id, terrain, spawns, objects }`. `id` is a content map ID. Terrain has `width`/`height` in cells (1…512, allowing tiny fixtures), and all five explicit row-major integer arrays: `level`, `ramp`, `surface`, `water`, `biome`. Each has exactly width × height values from the existing terrain vocabulary; ramp/shore geometry uses `checkTerrain`. File loading and resolving omitted source layers stay in the client/CLI.
- Map `spawns` contain unique authored `{ id, position, facing }` values, at most eight. `position` is a two-integer subcell tuple inside the half-open playable bounds; `facing` is 0…65,535 binary angle units. Map `objects` contain `{ definition, position, rotation, owner }`: a declared setup definition, the same position units/bounds, explicit 0/90/180/270 degree rotation and the source owner string (`neutral` or a declared spawn ID). These are validated static input; no spawn-to-Force ownership mapping, node semantics, occupancy or entity creation is inferred.
- `seed`: u32 integer; `debug`: boolean.
- `forces`: an array of `{ index, faction }`, using nonnegative int32 Force indices and content faction IDs such as `faction:eastern-collective`.
- `seats`: unique positive int32 seat indices. System seat 0 is implicit.
- `grants`: canonical `Grant` objects (`seat`, `force`, `scopes`, `grantedAtTick`, optional `revokedAtTick` and `expiresAtTick`) referencing declared seats and Forces.
- `definitions`: an ordered array of `{ id, health, speed, turnRate }`, using unique spawnable IDs and integer sim units. Health is 1…2³¹−1, speed is 0…2³¹−1 subcells per tick, and turn rate is 0…65,536 angle units per tick. Array order determines template indices and is preserved.

`commands` uses the canonical `{ tick, seat, sequence, type, payload }` shape. The parser reuses command validation, rejects duplicate `(tick, sequence)` keys and undeclared seats, spawn Forces or spawn definitions, and preserves supplied order; execution sorts a copy by `(tick, sequence)`. Live entity references, debug gating and grants are checked during execution and produce normal kernel rejection codes. Content hashes, full-state snapshots and migration remain outside this format.

`createMatch` repeats map validation for direct typed callers, copies every map array/object and freezes the whole map tree. Worlds share no map storage. `serializeMatchMap` writes fixed field order, row-major terrain and authored spawn/object array order; checkpoint hashes include that canonical map in addition to tick, PRNG streams and ECS state. Each kernel retains its immutable canonical map string once at setup, so debug publication does not copy, freeze or stringify unchanged terrain again. Changing terrain or static object input changes the hash even before any entity exists. Map identity alone is not a substitute for hashing its data. The phase-2 pack/content hash handshake is separate.

### Phase-1a divergence traces

`bun neo run <scenario> [--seed N] [--ticks T] --trace <file>` keeps the normal checkpoint output and writes a versioned JSON trace. `traceScenario`, exported from `@open-neo-rts/sim`, produces the same data in browsers without file I/O. The envelope is `{ format: 1, simVersion: 8, scenario, hashes, events }`. `scenario` embeds the full format-2 command log and effective map setup, including an overridden seed; `hashes` contains `{ tick, hash }` for tick 0 and every completed step; `events` is the kernel developer event log, including command results. `parseTrace` rejects unsupported versions, unknown fields, malformed values, missing/reordered ticks, truncated scenarios and events that do not match their commands.

`bun neo run --compare <trace-a> <trace-b>` exits 0 with `Traces match` when all hashes match. Otherwise it exits 1 and prints the first differing or missing tick, both recorded hashes, both event logs for the step that produced that state, and a per-entity/component/field diff of canonical ECS state after replay to that tick. State tick N means N steps have completed: its producing command events have tick N−1. Null diff values mean an entity/component/field is absent; `$entity` reports entity presence, `$present` component presence, and `$world.nextId` the ID allocator. An ended trace has a null recorded hash and replays only to its end.

Replay uses the comparing engine. The report includes `replayHashes` so a browser-specific divergence that does not reproduce locally remains visible even when the local state diff is empty. Recorded hashes are validated structurally, rather than required to match the local engine, because cross-engine mismatches are what the tool diagnoses.

On a browser scenario golden mismatch, Playwright attaches two browser traces and a Bun baseline trace under `test-results/`. CI's per-engine `browsers` jobs upload that directory on failure for 14 days as `determinism-traces-chromium`, `determinism-traces-firefox` or `determinism-traces-webkit`. Download the JSON attachments and pass a browser trace and the Bun trace to `--compare`.

### Offline worker checks (phase 1b)

`apps/web/e2e/offline-worker.e2e.ts` exercises real module workers from both the development route and production bundle. It initializes, spawns and moves through presentation handles, rejects malformed handles and missing grants, exports the canonical log, and compares the current hash with headless replay. It also checks pacing, disposal, stale callbacks, normal-mode debug rejection and the absence of full-state hashes in normal snapshots. `sim/projection` tests independently cover copied data, seat-isolated handles, restricted Force visibility and grant expiry. These tests do not claim phase-2 fog security or the later debug UI spawn-and-move flow.

## 3. Invariants checked every tick in test builds

- No negative resources; production refunds match costs.
- Entity IDs are unique and never reused within a match.
- Every command is either accepted or rejected with a reason code ([architecture.md §5](architecture.md#5-determinism-contract)); nothing silently drops.
- Units are only ordered by seats holding a valid grant at that tick.
- Fog: a seat's observation contains nothing outside its vision and fog memory.

## 4. Tooling

- **Runner:** `bun test` for everything that runs in Bun. **Playwright** for browser runs; it's a test tool, not a game dependency. Its specs are `apps/web/e2e/*.e2e.ts` (named so `bun test` ignores them), configured by the root `playwright.config.ts` and run with `bun run test:browsers`.
- **CLI integration deadlines:** the repeated 10,000-tick golden replay and benchmark unit-count acceptance tests allow 15 seconds for cold child processes and warmup on shared CI runners. Their inputs, work and assertions stay fixed. This correctness-test deadline is separate from the renderer's 60 FPS acceptance gate.
- **CI:** GitHub Actions checks merged batches on `main`: `bun run check`, `typecheck`, `test`, `build`, content validation and cross-engine browser determinism. New pushes cancel an outdated main run, so delivery can proceed without waiting for the same suite on every small PR. Inspect the final batch's run and fix any failures before starting the next batch. The workflow can also be dispatched manually. Nightly fuzz, AI-vs-AI and benchmarks remain planned.
- **Browser jobs:** Chromium, Firefox and WebKit run in separate matrix jobs with the same tests and unchanged 15-minute job limits. Linux Firefox uses headed Xvfb/Mesa for WebGL; the other engines remain headless. Keep smoke journeys bounded and use the existing initialization readiness budget for cold map loads, inside the normal test deadline.
- **Fixtures:** `@open-neo-rts/sim/testing` exports fresh 8×8 `flatMap()` and `terrainMap()` inputs (the latter includes a plateau, ramp, water, surfaces and biomes), `easternCollectiveTier1Definitions()` (the seven original tier-1 unit JSON files converted to integers) and `createCommandLog()`. Each log has `move(tick, seat, entities, x, y)`, `stop(tick, seat, entities)`, `spawn(tick, seat, definition, force, x, y, facing = 0)` and `spawnArmy(tick, seat, count, definition, force, x, y, facing = 0)`. They return canonical commands, assigning sequences across seats and types from 0 per tick within that log; use one builder for each command log. Army spawning returns commands for N units at the same position, without changing the world. `scriptedController({ [issueTick]: commands })` returns a controller for `registerController`: it emits at the issue tick, and the kernel executes those commands on the following tick.
- No snapshot testing of rendered images until the art direction settles.
