# Deterministic numerics

The simulation must produce bit-identical results on Bun (server, CLI), V8, SpiderMonkey and JavaScriptCore (browsers). JavaScript's transcendental `Math` functions differ between engines; we measured `sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `cbrt` and `hypot` disagreeing between Bun and V8 on 3–42% of inputs. So the sim uses **integers only**, plus the few operations IEEE guarantees to be exact. There are no exceptions; anything that seems to need a float gets an integer implementation in `packages/deterministic`.

## Allowed and banned

| Allowed in sim code                                                                                    | Banned in sim code (lint-enforced)                                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `+ - *` on integers whose result stays below 2^53                                                      | `Math.random` and every transcendental `Math.*` (`sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `hypot`, `cbrt`…) |
| `Math.floor`, `Math.trunc`, `Math.abs`, `Math.min`, `Math.max`, `Math.sign`, `Math.imul`, `Math.clz32` | `Float32Array`, `Float64Array`, floats stored in state                                                                |
| `Math.sqrt` on integers, only inside `isqrt` (correctly rounded by IEEE, then corrected)               | `Date`, `performance`, timers, `queueMicrotask`, `setImmediate`, `crypto`                                             |
| Bitwise ops on values that fit in 32 bits                                                              | `Intl`, `localeCompare`, `WeakRef`, `FinalizationRegistry`, `globalThis`                                              |
| Integer typed arrays (`Int32Array`, `Uint32Array`, `Uint16Array`, `Uint8Array`)                        | Iteration whose order depends on insertion history where that order affects outcomes                                  |

The lint guards (Biome `noRestrictedGlobals` plus the GritQL plugin in `tools/biome/`) cover the right-hand column for `packages/{deterministic,sim,ai,content}`. Iteration order and float values that sneak in through arithmetic (e.g. `a / b` without `Math.floor`) are caught by review and the determinism tests, not by lint.

## Units

| Quantity                             | Representation                                                             | Range                                      |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------ |
| **Position**                         | Integer **subcells**: 1 cell = 1,024 subcells                              | Max map 512 cells = 2^19 subcells per axis |
| **Distance squared**                 | Integer subcells²                                                          | ≤ 2^39, safely below 2^53                  |
| **Angle**                            | Binary angle units: a full turn is 65,536 (16 bits); wraps with `& 0xffff` | 0–65,535                                   |
| **Speed**                            | Subcells per tick                                                          | —                                          |
| **Time**                             | Ticks (20 per game second)                                                 | 2^31 ticks ≈ 3.4 years                     |
| **Health, damage, costs, resources** | Plain integers                                                             | < 2^31                                     |
| **Multipliers and percentages**      | Integer per-mille (1,000 = 100%)                                           | Products stay below 2^53 by construction   |

## Arithmetic rules

- **Division** is always explicit: `Math.floor(a / b)` (rounding toward negative infinity) for signed values. Never `| 0` for values that can exceed 32 bits. The helpers `divFloor` and `mulDiv(a, b, c)` in `packages/deterministic` assert their range limits in test builds.
- **Scaling:** `mulDiv(value, perMille, 1000)` multiplies first, then divides once. Chained modifiers apply in a documented order and **round once at the end**, not after each step.
- **Square root:** `isqrt(n)` computes `Math.floor(Math.sqrt(n))` and then corrects by ±1, which is exact for every integer below 2^53.
- **Trig:** `sin` and `cos` come from a **lookup table** of 16,384 entries for a quarter turn, scaled by 2^14 and committed to the repo as data. It's generated once offline, so no engine computes it at runtime. `atan2` uses integer CORDIC with a fixed iteration count.
- **Distance comparisons** use squared distances; only call `isqrt` when a real distance is needed.

## Content units

Content files use human units (cells, seconds, degrees, decimals allowed) so they stay readable ([content-format.md](../contributing/content-format.md#units-of-measure)). The loader converts each value **once, at load**: multiply by the unit's scale (1,024 subcells per cell, 20 ticks per second, 65,536 / 360 binary angle units per degree) and round with `Math.round`. This is exact on every engine: JSON number parsing and IEEE multiplication are correctly rounded by specification, so every client gets the same integers. The sim never sees the decimals.

## Random numbers

- The generator is **sfc32** (32-bit, with `Math.imul` and shifts only), seeded per stream via **splitmix32** from the match seed and a stream name (`combat`, `ai:<seat>`, `crates`, …).
- Each subsystem owns its stream, so adding a random roll in one system never shifts another's sequence.
- Stream states are part of snapshots and the state hash.

## Hashing

The canonical state hash is two independent 32-bit lanes (FNV-1a and Murmur3), giving 64 bits. It covers sorted entity IDs, components in a fixed order, feature tables, PRNG states and the tick. Hashes are computed at checkpoints (every 100 ticks by default, and at match end), not every tick.

## Strings and collections

- Compare strings by code unit (`a < b`), never `localeCompare`.
- Iterate entities by sorted stable ID. A `Map` or `Set` is fine when its insertion order is itself deterministic (inserted in sorted-ID order during the tick). Otherwise, sort before iterating.

## Tests

- Golden values for every function in `packages/deterministic`, run in Bun and in Chromium, Firefox and WebKit (Playwright).
- Property tests: `mulDiv`, `isqrt` and the trig lookups across their full documented range.
- Sim determinism tests run the same scenario in Bun and in each browser and compare checkpoint hashes. See [testing.md](testing.md).
