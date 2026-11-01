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
- Golden hashes live next to scenarios. A sim change that alters outcomes must update the goldens **and** bump the simulation version.
- On mismatch, the harness reports the **first divergent tick** and diffs the canonical state at that tick, using the developer event log.
- Replay compatibility: replays record the sim version and content hash; old replays either replay exactly or are rejected clearly.
- Every determinism test runs the scenario twice in one process, too. That catches leaked global state between worlds.

### Phase-1a command-log format

The JSON envelope is `{ "format": 1, "simVersion": 1, "setup": { ... }, "commands": [ ... ] }`. `format` versions the file shape; `simVersion` must equal the exported `SIM_VERSION`. Unknown fields and malformed values are rejected with JSON paths.

`setup` contains:

- `seed`: u32 integer; `debug`: boolean.
- `forces`: an array of `{ index, faction }`, using nonnegative int32 Force indices and content faction IDs such as `faction:eastern-collective`.
- `seats`: unique positive int32 seat indices. System seat 0 is implicit.
- `grants`: canonical `Grant` objects (`seat`, `force`, `scopes`, `grantedAtTick`, optional `revokedAtTick` and `expiresAtTick`) referencing declared seats and Forces.
- `definitions`: an ordered array of `{ id, health, speed, turnRate }`, using unique spawnable IDs and integer sim units. Health is 1…2³¹−1, speed is 0…2³¹−1 subcells per tick, and turn rate is 0…65,536 angle units per tick. Array order determines template indices and is preserved.

`commands` uses the canonical `{ tick, seat, sequence, type, payload }` shape. The parser reuses command validation, rejects duplicate `(tick, sequence)` keys and undeclared seats, spawn Forces or spawn definitions, and preserves supplied order; execution sorts a copy by `(tick, sequence)`. Live entity references, debug gating and grants are checked during execution and produce normal kernel rejection codes. Maps, content hashes, snapshots and migration are outside this format's phase-1a scope.

## 3. Invariants checked every tick in test builds

- No negative resources; production refunds match costs.
- Entity IDs are unique and never reused within a match.
- Every command is either accepted or rejected with a reason code ([architecture.md §5](architecture.md#5-determinism-contract)); nothing silently drops.
- Units are only ordered by seats holding a valid grant at that tick.
- Fog: a seat's observation contains nothing outside its vision and fog memory.

## 4. Tooling

- **Runner:** `bun test` for everything that runs in Bun. **Playwright** for browser runs; it's a test tool, not a game dependency. Its specs are `apps/web/e2e/*.e2e.ts` (named so `bun test` ignores them), configured by the root `playwright.config.ts` and run with `bun run test:browsers`.
- **CI:** GitHub Actions running `bun run check`, `typecheck`, `test`, `build` and the determinism suite, with Turborepo caching, plus the `browsers` job for cross-engine determinism. Nightly jobs run fuzz, AI-vs-AI and benchmarks.
- **Fixtures:** `@open-neo-rts/sim/testing` provides tiny maps, small Eastern Collective armies, command-log builders and scripted bots.
- No snapshot testing of rendered images until the art direction settles.
