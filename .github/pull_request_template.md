## Primary type

<!-- Choose one primary type. Include evidence for every affected type in the feature batch; see docs/contributing/pull-requests.md. -->

- [ ] Engine
- [ ] New unit
- [ ] New structure
- [ ] Faction
- [ ] Balance
- [ ] Map
- [ ] Art
- [ ] Translation
- [ ] Pack
- [ ] Tooling
- [ ] Docs

## What and why

<!-- One or two sentences. Closes #… or links the task in docs/project/tasks.md. -->

## Checklist

- [ ] `bun run check`, `bun run typecheck`, `bun run test`, `bun run build` pass locally
- [ ] Content changed: `bun neo validate` passes, and the manifest lists every new file
- [ ] Match outcomes change: golden hashes updated and simulation version bumped (label `sim-version-bump`)
- [ ] No new dependency, or the reason is below
- [ ] Docs updated where behaviour or workflow changed

## Evidence

<!--
Engine: tests added, determinism notes.
Unit / structure / faction: how it fits the faction doc; counters.
Balance: the reason and the balance report diff.
Art: screenshots from the content editor (team colours, damage states, sockets).
Map: preview and spawn fairness notes.
-->
