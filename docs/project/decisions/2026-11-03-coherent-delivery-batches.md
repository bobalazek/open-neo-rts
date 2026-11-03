# 2026-11-03 — Coherent delivery batches and consolidated history

**Context.** The owner requested fewer, larger commits and asked to reduce the
existing history by roughly two thirds. The existing history accumulated too
many small commits. The previous
[one-task/one-PR decision](./2026-11-01-work-through-prs.md) needs a limited
exception for smaller related tasks.

**Decision.** Keep one substantial task per branch and PR as the default; small
related tasks may share a PR. Keep necessary content, fixes, checks and docs with
their task. Choose a primary PR type and apply the checks for every affected
type. Squash unpublished WIP and related fix-ups before publishing; squash merge
the reviewed PR into one Conventional Commit. Related models may ship together.
This relaxes the strictly per-task/per-type rule while retaining task-sized
reviews. The owner's clarification targets commit volume, not large PRs that
combine unrelated work.

The owner-authorized history consolidation reduced main from 363 to 121 commits,
from `ad5b65bfc937b7d9dbf29268e10960455d819ac5` to
`c9f29351b72ed29967740e2973470fc2407d38af`. All retained checkpoint trees match
their original endpoints; both tips have tree
`455d4250c564428c97e8a70f7c2940984ead9f2e`. Endpoint author identities and dates
are preserved. A verified local Git bundle retains original main and the
unfinished statistics branch, with a complete original-to-checkpoint map.

**Consequences.** Run focused checks while implementing and full relevant checks
at batch boundaries. Keep required review, determinism and content validation.
Split unrelated work; avoid per-file, per-model, WIP and evidence-only commits.
Old branches retain the previous ancestry: reapply only their unique changes
onto the new main instead of merging the old history back in. The history backup
contains Git objects and LFS pointers, not a separate copy of LFS payloads; no LFS
objects or existing worktrees were deleted. Repository history is reduced;
GitHub profile totals may remain stale, and PR contributions are separate.
