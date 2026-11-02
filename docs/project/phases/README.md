# Phase task details

[tasks.md](../tasks.md) is the queue of actionable work. [1a.md](./1a.md) details the engine foundations; [1b.md](./1b.md) details debug mode, maps, rendering and navigation. [2.md](./2.md) details first-playable skirmish dependencies and acceptance gates. The owner [authorized gameplay work before the remaining phase-1b acceptance](../decisions/2026-11-02-gameplay-before-performance.md); this does not settle pending gameplay decisions or declare phase 1b complete. Phases 3–5 remain specified by the [roadmap](../roadmap.md); their detailed plans have not been written.

Pick an unblocked task, use one branch and PR, and update its status when it lands. Do not treat an unfinished plan as implemented code.

## Rules for every task

Follow [AGENTS.md](../../../AGENTS.md) and the [PR workflow](../../contributing/pull-requests.md). Run `bun run fix`, `bun run typecheck` and `bun run test`; run `bun neo validate` for content changes. Outcome changes require updated golden hashes and a simulation version bump. Pending decisions remain in [human-tasks.md](../human-tasks.md).
