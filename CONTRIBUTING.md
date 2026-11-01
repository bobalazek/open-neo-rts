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

| Command                         | What                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `bun run check` / `bun run fix` | Biome lint and format (check only / apply fixes)                       |
| `bun run typecheck`             | TypeScript across all packages                                         |
| `bun run test`                  | All tests                                                              |
| `bun run build`                 | Production build                                                       |
| `bun neo <command>`             | Project CLI (`bun neo` lists commands), e.g. `bun neo validate-assets` |

The repo layout is described in [docs/engineering/architecture.md](docs/engineering/architecture.md#3-monorepo-layout).

## What to read first

| You want to…                                   | Read                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Add a unit, structure, weapon, tech or faction | [docs/contributing/adding-content.md](docs/contributing/adding-content.md)                                                 |
| Add models, textures or audio                  | [docs/contributing/assets.md](docs/contributing/assets.md)                                                                 |
| Change simulation code                         | [Determinism contract](docs/engineering/architecture.md#5-determinism-contract) and [testing](docs/engineering/testing.md) |
| Make a map                                     | [docs/engineering/map-editor.md](docs/engineering/map-editor.md)                                                           |
| Understand the game                            | [docs/design/](docs/README.md)                                                                                             |

## Workflow

1. For anything bigger than a small fix, open an issue or discussion first, so effort isn't wasted.
2. Branch from `main`: `feat/…`, `fix/…`, `content/…`, `docs/…`.
3. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat(sim): …`, `content(afn): add panther`).
4. Open a PR using the template. Keep PRs focused: one feature, one unit family, or one fix.

## Rules that matter most

- **Determinism.** Simulation code (`packages/deterministic`, `sim`, `ai`, `content`) uses no floats in gameplay state, no `Math.random`, no wall-clock time, and no unordered iteration. Biome enforces part of this. If your change alters match outcomes, update the golden hashes **and** bump the simulation version in the same PR.
- **Boundaries.** The renderer never mutates the sim. The sim never imports the renderer, React, the network or the DOM. AI only emits commands.
- **Our own core.** No new dependencies for gameplay systems (ECS, physics, pathfinding, AI…). See [build vs. use](docs/engineering/architecture.md#build-vs-use). Any new dependency needs a reason in the PR.
- **Content is data.** If a unit needs engine code, add a general capability, not a special case.
- **Assets** are original work with an `assets.json` entry. Binaries go through Git LFS.

## Pull request checks

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) must pass before review: `check`, `typecheck`, `test`, `build` and `bun neo validate-assets`. The determinism suite, browser tests and content validation join as they're built. Reviewers follow [review-checklists.md](docs/contributing/review-checklists.md).

## Previews

_(Planned.)_ Every PR gets a preview build of the web client at its own URL. A bot comment on the PR lists:

- the preview URL;
- a [map editor playtest](docs/design/modes.md#map-editor-and-playtest) deep link for every added or changed unit and structure, e.g. `/editor/playtest?map=core.map:flat-test&spawn=neo-2035.unit:panther&vs=neo-2035.unit:tactical-operator`;
- the content validation report and, later, rendered turntable thumbnails of new models.

Reviewers use these links to try new content without checking out the branch. The hosting provider is still open; it needs per-PR preview URLs.

## Using coding agents

Agents are welcome. [AGENTS.md](AGENTS.md) holds the repo rules for them. Step-by-step contributor tooling for agents (adding a unit, adding a sim feature) will ship as a plugin once the content schemas and the first sim features exist. You're responsible for what you submit: review agent output like your own code, and make sure assets are original.

## Licence

Everything in this repository (code and assets) is [MIT-licensed](LICENSE). By contributing, you agree to license your contribution under MIT.
