# Agent instructions

Rules for coding agents (Claude Code, Codex, etc.) working in this repo. Humans: see [CONTRIBUTING.md](CONTRIBUTING.md), which these rules summarize.

## Orientation

- Docs index: [docs/README.md](docs/README.md). Read the relevant design or engineering doc before changing a system.
- Monorepo: Bun workspaces + Turborepo, Biome, TypeScript 7. Packages are source-only (`exports` points to `src/index.ts`).
- Commands: `bun run check | fix | typecheck | test | build | dev`. Run `fix`, `typecheck` and `test` before finishing.

## Hard rules

1. **Determinism.** In `packages/{deterministic,sim,ai,content}`: integers only, no floats in state, no `Math.random` or transcendental `Math.*`, no `Date`, `performance`, timers, `crypto`, `Intl`, `localeCompare`, and iterate in sorted-ID order wherever order affects outcomes. **Lint-enforced:** the banned APIs (Biome `noRestrictedGlobals` + `tools/biome/` GritQL plugin). **Review-enforced:** float arithmetic sneaking in (e.g. `a / b` without `Math.floor`) and iteration order. Spec: [numerics.md](docs/engineering/numerics.md) and [architecture.md §5](docs/engineering/architecture.md#5-determinism-contract).
2. **Boundaries.** The sim never imports render, React, networking or DOM code. The renderer never mutates sim state. AI only emits commands.
3. **Build vs. use.** Don't add libraries for gameplay systems (ECS, physics, pathfinding, AI, protocol); we write those. Any new dependency must be justified in the PR. [Details](docs/engineering/architecture.md#build-vs-use).
4. **Content is data.** Units, structures, weapons, abilities and techs are JSON definitions, never classes or special cases.
5. **Assets.** Original work only, never downloaded or third-party. Never invent authorship. Binaries go through Git LFS.
6. **Outcome changes** to the sim require updating golden hashes and bumping the simulation version.
7. **Feature folders.** Code is split by feature; components live with the feature that owns them. Every folder in the [documented layout](docs/engineering/architecture.md#3-monorepo-layout) already exists, with an `index.ts` stating its purpose and phase (the layout lists the exceptions); fill those, and don't invent new top-level folders without updating that layout. Apps stay thin: logic goes in packages.
8. **Phase scope.** Build only what the current phase lists in [roadmap.md](docs/project/roadmap.md#what-each-phase-builds), and pick work from [tasks.md](docs/project/tasks.md). The other docs describe the whole game; they are reference, not a to-do list.
9. **One task, one PR.** Each task becomes one branch and one pull request of one type ([pull-requests.md](docs/contributing/pull-requests.md)); the PR removes the task from `tasks.md`. Pending decisions live in [human-tasks.md](docs/project/human-tasks.md): never decide them silently.

## Working with the owner

These come from explicit, sometimes strong, feedback.

- **Never invent content in place of the owner's.** Factions, their names, units and structures come from the owner's design ([story.md](docs/design/story.md), [factions/](docs/design/factions/README.md)). Mark any necessary addition _Addition_ and keep additions minimal.
- **Full faction names** in docs and IDs (Alliance of Free Nations, Eastern Collective, Phoenix Initiative); abbreviations only in brackets.
- **Research before designing.** For game-design questions, check how established RTS games and engines do it, cite sources, and don't guess.
- **Ask before running bulk scripts** that generate or rewrite many files. Hand edits and project CLI checks are fine.
- **Co-locate.** One folder per unit or structure, with weapons, abilities, research and English text inline. Engine vocabulary (roles, armour classes, resources, settings) is code, not content.
- **Keep it tidy:** no speculative concepts, no stale references, no unexplained jargon. Show folder structures as tree diagrams, not tables.
- **Commit and push only when asked.** Conventional Commits, no attribution lines.

## Gotchas

- Bun and V8 disagree on trig, so the sim uses tables ([learning](docs/project/learnings/2026-11-01-trig-differs-between-engines.md)).
- `typecheck` and `test` depend on Turborepo's `transit` task, or caches hide cross-package errors ([learning](docs/project/learnings/2026-11-01-turbo-cache-false-pass.md)).
- Biome formats Markdown and reflows tables, so re-read a doc after `bun run fix` before an exact-string edit.
- `content/schemas` is generated and excluded from Biome: edit `packages/content/src/schemas/definitions.ts`, then run `bun neo generate-schemas`.
- `packages/content` compiles without DOM or Bun types because the sim shares it; file I/O belongs in `apps/cli`.
- Git LFS tracks binaries. CI's code job pulls only the six renderer-test GLBs and two Training Grounds layers listed in `ci.yml`; browser jobs also pull the fog fixture's original models. The content job pulls all LFS with a cache.
