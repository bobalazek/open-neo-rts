# 2026-11-01 — From phase 1, every task lands as one pull request

**Context.** Phase 0 was built in a few large commits straight on `main`: docs, tooling and content changed together. From phase 1 the work splits into many independent tasks (engine features, maps, models, tooling), and reviewers need to see one thing at a time.

**Decision.** Every task in [tasks.md](../tasks.md) becomes one branch and one pull request of exactly one type ([pull-requests.md](../../contributing/pull-requests.md)), with CI green before merge. The PR that finishes a task removes it from `tasks.md` and updates any doc it changes.

**Consequences.** More, smaller PRs, each with its own review. Branch protection and required checks are still a pending human task, so until they exist, the rule is followed by convention.
