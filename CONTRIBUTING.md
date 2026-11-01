# Contributing to open-neo-rts

Thanks for helping. The project is early: most of what exists is design docs in [docs/](docs/README.md), and the first code milestone is a deterministic headless simulation. Discussion, design feedback and small PRs are all welcome.

## Setup

```sh
git lfs install          # once per machine; assets are stored with Git LFS
git clone git@github.com:bobalazek/open-neo-rts.git
cd open-neo-rts
bun install
bun run dev              # web client
```

| Command                                                        | What                                                                                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check` / `bun run fix`                                | Biome lint and format (check only / apply fixes)                                                                                                   |
| `bun run typecheck`                                            | TypeScript across all packages                                                                                                                     |
| `bun run test`                                                 | All tests in Bun                                                                                                                                   |
| `bun run test:browsers`                                        | Playwright tests in Chromium, Firefox and WebKit                                                                                                   |
| `bun run build`                                                | Production build                                                                                                                                   |
| `bun neo validate`                                             | Every content and asset check (what CI runs)                                                                                                       |
| `bun neo make-placeholders [pack]`                             | Block-model GLBs, wrecks and icons for definitions without art (default pack: `core`)                                                              |
| `bun neo generate-schemas`                                     | Regenerate `content/schemas` after changing content types (`--check` fails if stale)                                                               |
| `bun neo`                                                      | List all CLI commands                                                                                                                              |
| `bun neo run <scenario> [--seed N] [--ticks T] [--trace file]` | Run a versioned command log twice, print hashes and optionally save a per-tick trace                                                               |
| `bun neo run --compare <trace-a> <trace-b>`                    | Report the first divergent tick, event logs and canonical state diff                                                                               |
| `bun neo bench [--workload NAME] [--units N] [--ticks T]`      | `flat`: full-sim/ECS (default 1,000 units); `navigation`: 256×256 compiler/search/scheduler (default 300 unit request slots); 1,000 measured ticks |

The repo layout is described in [docs/engineering/architecture.md](docs/engineering/architecture.md#3-monorepo-layout).

Develop related work in coherent batches. Use focused checks while implementing; run the full relevant checks once at the batch end. CI checks merged `main` and cancels superseded runs, rather than running the same suite on every small PR. A batch is finished when its final CI run passes.

For model checks, run `bun run dev` and open `/debug?models=1`. Choose a GLB to inspect team colours and animation clips; the file stays in the browser. The normal `/` route shows terrain.

## What to read first

| You want to…                                   | Read                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Add a unit, structure, weapon, tech or faction | [docs/contributing/adding-content.md](docs/contributing/adding-content.md)                                                 |
| Add models, textures or audio                  | [docs/contributing/assets.md](docs/contributing/assets.md)                                                                 |
| Change simulation code                         | [Determinism contract](docs/engineering/architecture.md#5-determinism-contract) and [testing](docs/engineering/testing.md) |
| Make a map                                     | [docs/engineering/map-editor.md](docs/engineering/map-editor.md)                                                           |
| Understand the game                            | [docs/design/](docs/README.md)                                                                                             |

## Workflow

1. Pick a task from [tasks.md](docs/project/tasks.md). For anything that isn't listed and is bigger than a small fix, open an issue or discussion first, so effort isn't wasted.
2. Each task is one branch and one pull request of exactly one type, with the branch prefix that type uses ([pull-requests.md](docs/contributing/pull-requests.md)).
3. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(sim): …`, `content(alliance-of-free-nations): add panther mbt`).
4. Open the PR using the template. In the same PR, remove the task from `tasks.md`.

## Rules that matter most

- **Determinism.** Simulation code (`packages/deterministic`, `sim`, `ai`, `content`) uses no floats in gameplay state, no `Math.random`, no wall-clock time, and no unordered iteration. Biome enforces part of this. If your change alters match outcomes, update the golden hashes **and** bump the simulation version in the same PR.
- **Boundaries.** The renderer never mutates the sim. The sim never imports the renderer, React, the network or the DOM. AI only emits commands.
- **Our own core.** No new dependencies for gameplay systems (ECS, physics, pathfinding, AI…). See [build vs. use](docs/engineering/architecture.md#build-vs-use). Any new dependency needs a reason in the PR.
- **Content is data.** If a unit needs engine code, add a general capability, not a special case.
- **Assets** are original work with an `assets.json` entry. Binaries go through Git LFS.

## Pull request checks

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) must pass before review: `check`, `typecheck`, `test`, `build`, `bun neo generate-schemas --check`, the browser determinism tests (`bun run test:browsers`), and `bun neo validate` when content changes. The determinism suite and end-to-end tests join as they're built. Reviewers follow [review-checklists.md](docs/contributing/review-checklists.md).

## Previews

_(Planned.)_ Every PR gets a preview build of the web client at its own URL. A bot comment on the PR lists:

- the preview URL;
- a [debug mode](docs/design/screens/debug-mode.md#how-it-stays-honest) deep link for every added or changed unit and structure, e.g. `/debug?map=core.map:training-grounds&seed=1&force=eastern-collective&spawn=core.unit:eastern-collective/dragon-tank@40,12`;
- the content validation report and, later, rendered turntable thumbnails of new models.

Reviewers use these links to try new content without checking out the branch. The hosting provider is still open; it needs per-PR preview URLs.

## Using coding agents

Agents are welcome. [AGENTS.md](AGENTS.md) holds the repo rules for them. Step-by-step contributor tooling for agents (adding a unit, adding a sim feature) will ship as a plugin once the first sim features exist. You're responsible for what you submit: review agent output like your own code, and make sure assets are original.

## Licence

Everything in this repository (code and assets) is [MIT-licensed](LICENSE). By contributing, you agree to license your contribution under MIT.
