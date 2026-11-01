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
7. **Feature folders.** Code is split by feature; components live with the feature that owns them. Don't create empty scaffolding.

## Skills

Step-by-step procedures live in [`.claude/skills/`](.claude/skills/). Claude Code loads them automatically; other agents should read the matching `SKILL.md` before the task.

| Skill             | Use for                                               |
| ----------------- | ----------------------------------------------------- |
| `add-content`     | New unit, structure, weapon, ability, tech or faction |
| `add-sim-feature` | New simulation feature or system in `packages/sim`    |
