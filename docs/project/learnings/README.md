# Learnings

One file per surprise: something that broke, a gotcha, a measurement worth remembering. Append-only; a wrong learning gets a correction entry. One paragraph is enough.

File names: `YYYY-MM-DD-short-slug.md`. Add one line to the index for each.

## Index

Newest first.

- [2026-11-01 — First headless tick measurements](./2026-11-01-first-tick-benchmark.md) — 1,000 moving units across eight Forces: mean 0.216 ms, p95 0.304 ms, max 2.093 ms on an M1 Max; simple ECS baseline included.
- [2026-11-01 — Trig differs between JS engines](./2026-11-01-trig-differs-between-engines.md) — `Math.sin`, `cos`, `atan2`, `exp`, `log`, `cbrt` and `hypot` disagreed between Bun and V8 on 3–42% of inputs.
- [2026-11-01 — Turborepo cache hid a type error](./2026-11-01-turbo-cache-false-pass.md) — Source-only packages need a transit task, or typecheck replays stale passes.
