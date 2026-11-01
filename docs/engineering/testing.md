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

- `bun neo run <scenario> --seed N` produces a hash per checkpoint (e.g. every 100 ticks) and the final state hash.
- Golden hashes live next to scenarios. A sim change that alters outcomes must update the goldens **and** bump the simulation version.
- On mismatch, the harness reports the **first divergent tick** and diffs the canonical state at that tick, using the developer event log.
- Replay compatibility: replays record the sim version and content hash; old replays either replay exactly or are rejected clearly.
- Every determinism test runs the scenario twice in one process, too. That catches leaked global state between worlds.

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
