# Phase task details

[tasks.md](../tasks.md) is the queue of actionable work. [1a.md](./1a.md) adds scope and acceptance criteria for the engine foundations. Other phases are still specified by the [roadmap](../roadmap.md); their detailed plans have not been written.

Pick an unblocked task, use one branch and PR, and update its status when it lands. Do not treat an unfinished plan as implemented code.

## Rules for every task

Follow [AGENTS.md](../../../AGENTS.md) and the [PR workflow](../../contributing/pull-requests.md). Run `bun run fix`, `bun run typecheck` and `bun run test`; run `bun neo validate` for content changes. Outcome changes require updated golden hashes and a simulation version bump. Pending decisions remain in [human-tasks.md](../human-tasks.md).
