# 2026-11-01 — Debug mode is the first visual milestone

**Context.** After the headless simulation (phase 1a), the next step could be the match HUD and a skirmish (phase 2), or a developer tool first. Without a way to put any unit on any terrain and watch it, every feature until the first playable would be tested only headless, and terrain, placement and pathing bugs would surface late.

**Decision.** Phase 1b delivers **debug mode** ([debug-mode.md](../../design/screens/debug-mode.md)): `bun run dev`, open `/debug`, pick any map, spawn any unit, structure or prop for any Force, give orders, step ticks and inspect sim state. It runs the real sim in the client's worker behind the per-seat projection, like single player. Spawning and editing are `debug.*` sim commands, accepted only in debug matches and recorded in the command log. Small **sandbox maps** each show one terrain feature (heights, water, biomes, resources). Playwright **end-to-end tests** drive debug mode in CI.

**Consequences.** Every later feature is visible and testable in the browser as soon as it exists, and a session exported from debug mode becomes a scenario for `bun neo run`. The debug commands are extra surface that normal matches must reject, which needs its own test. The map editor's playtest reuses debug mode instead of building its own tools.
