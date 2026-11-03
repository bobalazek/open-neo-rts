# Pull requests

Default to one substantial task per pull request; small related tasks may share a PR. Choose one **primary type** and keep the implementation, required content, fixes, checks and docs together. The primary type decides the branch prefix, commit scope and label; apply the checks and review requirements for every affected type ([review-checklists.md](review-checklists.md)). Tasks in [tasks.md](../project/tasks.md) suggest their primary type.

## From task to merge

1. Pick one task from [tasks.md](../project/tasks.md), grouping small related tasks when useful. Unlisted work starts as an issue. Record provisional choices under the accepted [implementation autonomy](../project/decisions/2026-11-02-provisional-implementation-autonomy.md); pending owner review stays in [human-tasks.md](../project/human-tasks.md).
2. Branch from `main` with the type's prefix (below).
3. Use focused checks while implementing; run `bun run fix`, `typecheck` and `test` at the batch boundary, plus `bun neo validate` for content. Fold unpublished WIP and related fix-up commits into feature-sized commits before publishing.
4. Open the PR with the template. In the same PR, remove completed tasks from `tasks.md`, add any follow-up tasks it uncovered, and update the docs it changes.
5. Merge when CI is green and a reviewer approves ([Merging](#merging)).

## Types

| Type              | What changes                                                                         | Branch                               | Commit example                                           | Label               |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------- | ------------------- |
| **Engine**        | Code in `packages/` that changes how the game works: sim features, renderer, net, AI | `feat/…`, `fix/…`                    | `feat(sim): add path budget per force`                   | `engine`            |
| **New unit**      | One unit folder: `unit.json` (+ its model, icon, sounds when art exists)             | `content/unit-<faction>-<name>`      | `content(eastern-collective): add flame tank`            | `content:unit`      |
| **New structure** | One structure folder                                                                 | `content/structure-<faction>-<name>` | `content(alliance-of-free-nations): add sensor array`    | `content:structure` |
| **Faction**       | A new faction folder, or a change across a faction's roster                          | `content/faction-<name>`             | `content(phoenix-initiative): add mercenary camp roster` | `content:faction`   |
| **Balance**       | Numbers only: costs, health, damage, `versus`, cooldowns                             | `balance/<topic>`                    | `balance: reduce dragon tank siege range`                | `balance`           |
| **Map**           | One map folder                                                                       | `content/map-<name>`                 | `content(maps): add training grounds`                    | `content:map`       |
| **Art**           | Models, icons, textures, sounds for existing definitions                             | `art/<faction>-<name>`               | `art(eastern-collective): dragon tank model`             | `art`               |
| **Translation**   | One `locales/<lang>.json`                                                            | `i18n/<lang>`                        | `i18n(de): translate eastern collective`                 | `i18n`              |
| **Pack**          | A new content pack (a mod), or a pack manifest change                                | `pack/<name>`                        | `pack(desert-war): initial pack`                         | `pack`              |
| **Tooling**       | CLI, CI, validators, build config                                                    | `chore/…`                            | `chore(cli): add balance-report command`                 | `tooling`           |
| **Docs**          | Only docs                                                                            | `docs/…`                             | `docs: explain wonder race`                              | `docs`              |

Split unrelated work. Supporting content, balance, art, tooling and docs needed by the same feature stay in the batch, with evidence for each affected type. Related models may ship together; a separate PR per model is not required.

## What each type must include

| Type                 | Must include                                                                                                                                  | CI runs                                          | Reviewer focuses on                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Engine               | Tests (unit and determinism); updated docs; golden hashes and a simulation version bump if match outcomes change                              | check, typecheck, test, build, determinism suite | Boundaries, determinism, performance, fog leaks                                            |
| New unit / structure | The definition with `role`, weapons inline, `presentation` listing parts, sockets and clips; the manifest entry; English name and description | `bun neo validate`                               | Matches the faction doc; counters make sense; damage and health within the reference bands |
| Faction              | Faction doc updated with every structure and unit; start kit; builder and harvester roles present                                             | `bun neo validate`                               | Asymmetry and identity; tech tree completeness                                             |
| Balance              | The reason; the balance report diff; AI-vs-AI results once available                                                                          | `bun neo validate`, balance report               | Whether the change fixes the stated problem without breaking a counter                     |
| Map                  | `map.json` with spawns, player count, resources; preview image                                                                                | `bun neo validate` (map checks)                  | Fairness between spawns; reachable resources                                               |
| Art                  | Files following the [model conventions](assets.md#model-conventions); `assets.json` with the author; screenshots from the content editor      | `bun neo validate` (asset checks)                | Style, readability at RTS zoom, team colour slots, sockets                                 |
| Translation          | Every key for that language                                                                                                                   | `bun neo validate` (coverage report)             | Tone and length in the UI                                                                  |
| Pack                 | Manifest with version, engine range, dependencies; validates on its own                                                                       | `bun neo validate`                               | Conflicts with other packs; gameplay vs. cosmetic flag                                     |
| Tooling              | Tests for non-trivial logic                                                                                                                   | check, typecheck, test                           | Simplicity; CI cost                                                                        |
| Docs                 | Links resolve                                                                                                                                 | check                                            | Accuracy against code and other docs                                                       |

## Description

The [PR template](../../.github/pull_request_template.md) asks for: the type, what changes and why, the task or issue it closes, and type-specific evidence (screenshots for art, the balance diff for balance, golden-hash notes for engine).

## Labels

`engine`, `content:unit`, `content:structure`, `content:faction`, `content:map`, `balance`, `art`, `i18n`, `pack`, `tooling`, `docs`, plus `sim-version-bump` when match outcomes change, and `needs-decision` when a human task blocks it.

## Merging

- Squash merge, with the PR title as the commit message (Conventional Commits).
- CI must be green, and one approving review is required.
- PR previews ([CONTRIBUTING.md](../../CONTRIBUTING.md#previews)) let reviewers try content without checking out the branch, once preview hosting exists.
