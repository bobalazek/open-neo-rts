# Project

Where the project's state lives: what's planned, what's next, what's waiting on a person, what we decided and why, and what we learned. Design docs (`docs/design`) say what the game is; engineering docs (`docs/engineering`) say how it's built; this folder says **where we are**.

## Layout

| Path                               | What goes in it                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| [roadmap.md](./roadmap.md)         | Phases, exit criteria, and which docs each phase builds                                  |
| [tasks.md](./tasks.md)             | Work an agent or contributor can start now without a further decision, grouped by phase  |
| [human-tasks.md](./human-tasks.md) | Decisions and actions that need a person. Each item names its owner and what it unblocks |
| [decisions/](./decisions/)         | One file per non-obvious decision: context, decision, consequences. Append-only          |
| [learnings/](./learnings/)         | One file per surprise: things that broke, gotchas, measurements. Append-only             |
| [incidents/](./incidents/)         | One file per post-mortem, once there's something running. Append-only                    |

## When to write what

- **Roadmap:** when a phase's scope or exit criteria change.
- **Tasks:** when work becomes actionable. Remove it when it's merged. One line each, linking the doc that specifies it.
- **Human tasks:** when work is blocked on a decision, an approval, credentials or anything off-repo. When resolved, remove it, record the outcome in `decisions/` if it isn't obvious, and add the unblocked work to `tasks.md`.
- **Decisions:** after choosing path A over path B when a future contributor might re-argue it. Pending choices belong in `human-tasks.md`.
- **Learnings:** after anything surprising. One paragraph is enough.
- **Incidents:** after any outage, data loss, security problem or broken release.

## Conventions for entries

- File names are `YYYY-MM-DD-short-slug.md`, so they sort by date.
- Every new entry adds one line to its folder's `README.md`: `- [YYYY-MM-DD — title](./file.md) — one-sentence summary.`
- Keep entries short. Don't rewrite history: if a decision is reversed or a learning was wrong, add a new entry that references the old one.
