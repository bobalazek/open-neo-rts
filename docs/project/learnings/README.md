# Learnings

- [Observe short-lived orders at the worker boundary](./2026-11-02-observe-short-lived-orders.md) — A completed minimap order can legitimately disappear before a slow UI assertion starts.

One file per surprise: something that broke, a gotcha, a measurement worth remembering. Append-only; a wrong learning gets a correction entry. One paragraph is enough.

File names: `YYYY-MM-DD-short-slug.md`. Add one line to the index for each.

## Index

Newest first.

- [2026-11-03 — Native HUD texture/CSS coordinates](./2026-11-03-native-hud-coordinates.md) — Scale hit guards, tooltip anchors and paint probes consistently; prefer recipe thumbnails before resource pictograms.

- [2026-11-03 — Repaint native tabs after key dispatch](./2026-11-03-native-keyboard-repaint.md) — Capturing-key microtasks can read the previous tab; verify painted native content after the target handler.

- [2026-11-03 — Preserve unchanged live button labels](./2026-11-03-live-button-labels.md) — Replacing text between pointer events can cancel WebKit clicks.

- [2026-11-02 — Asset readiness and immediate picking](./2026-11-02-model-pick-readiness.md) — Commit posed live geometry at picking even before the next scene frame.

- [2026-11-02 — Budget sequential terrain readiness explicitly](./2026-11-02-terrain-picker-readiness.md) — Bound all six software-WebGL map loads without changing assertions or FPS acceptance.

- [2026-11-02 — Reuse normal identity fixture baselines](./2026-11-02-normal-identity-fixture-work.md) — Remove repeated cold initialization while retaining every correctness assertion and the existing timeout.

- [2026-11-02 — Foreground renderer capture](./2026-11-02-foreground-renderer-capture.md) — Calibrated unlocked/awake probes; qualified original 200-unit Medium run measures 50.373 fps and fails the 60 fps gate.

- [2026-11-01 — Navigation work is separate from full-match cost](./2026-11-01-navigation-benchmark.md) — 300 request slots on 256×256 terrain, fixed node quota, cold compilation and warm scheduler timings reported separately.
- [2026-11-01 — DOM key delivery does not prove native shortcut capture](./2026-11-01-key-capture-limits.md) — Browser key-event probe and explicit native/fullscreen/fallback gates; F1 remains owner-decided.

- [2026-11-01 — First headless tick measurements](./2026-11-01-first-tick-benchmark.md) — 1,000 moving units across eight Forces: mean 0.216 ms, p95 0.304 ms, max 2.093 ms on an M1 Max; simple ECS baseline included.
- [2026-11-01 — Trig differs between JS engines](./2026-11-01-trig-differs-between-engines.md) — `Math.sin`, `cos`, `atan2`, `exp`, `log`, `cbrt` and `hypot` disagreed between Bun and V8 on 3–42% of inputs.
- [2026-11-01 — Turborepo cache hid a type error](./2026-11-01-turbo-cache-false-pass.md) — Source-only packages need a transit task, or typecheck replays stale passes.
