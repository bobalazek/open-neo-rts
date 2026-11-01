# Review checklists

What a reviewer checks on every PR, whether the reviewer is a person or an agent. Items marked **CI** are automated and only need a glance at the checks; everything else needs reading.

## Every PR

- [ ] **CI** green: `check`, `typecheck`, `test`, `build`, `bun neo validate-assets`.
- [ ] The change is in scope for the current phase ([roadmap](../project/roadmap.md#what-each-phase-builds)), and the PR is exactly one [type](pull-requests.md), or the PR says why it isn't.
- [ ] One concern per PR. Unrelated changes are split out.
- [ ] Names and structure follow [conventions.md](conventions.md).
- [ ] Docs are updated where behaviour, workflow or conventions changed.
- [ ] No new dependency, or the reason is in the PR description.

## Code

- [ ] **Boundaries:** sim code doesn't import render, net, UI or DOM; render never writes sim state; AI only emits commands; cross-package imports use package names only.
- [ ] **Determinism** (sim, ai, content, deterministic): **CI** catches banned APIs. A reviewer checks for float arithmetic (division without `Math.floor`, decimals in state) and for iteration whose order isn't canonical.
- [ ] **Outcome changes:** if match results can change, the golden hashes are updated and the simulation version is bumped, in the same PR.
- [ ] **Commands:** new player actions are commands with validation (grants, ownership, visibility, costs) and a rejection reason; no silent drops.
- [ ] **Fog:** nothing new sends hidden state to a client: new message fields, rejection codes, IDs, timings.
- [ ] **Tests** cover the behaviour and its non-happy paths, with fixed seeds.
- [ ] **Simplicity:** no speculative abstraction, no unused exports, no dead code.

## Content

- [ ] **CI:** schema, references, asset validation and provenance pass.
- [ ] The definition matches its design doc (faction roster, role, counters), or the PR explains the change.
- [ ] **Balance changes** state the reason; once available, the balance report and AI-vs-AI diff are attached.
- [ ] **Assets are original work**; `assets.json` names a real author and source file.
- [ ] The model was checked in the [content editor](../design/screens/content-editor.md): sockets point the right way, team colour lands on the right parts, damage states and destruction look right.
- [ ] Locale strings are present and read well in English.
- [ ] The playtest preview link from the PR bot was opened, and the unit behaves as described.

## Docs

- [ ] Accurate against the code and the other docs. Contradictions are fixed, not added.
- [ ] States its phase, if it describes future work.
- [ ] Links resolve (CI link check, later).
