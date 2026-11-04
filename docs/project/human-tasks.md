# Human tasks

Decisions and actions that need a person. Every item names its owner and what it unblocks. When one is resolved: remove it, record the outcome in [decisions/](./decisions/) if it isn't obvious, and add the unblocked work to [tasks.md](./tasks.md).

## Review and later tuning

The owner [delegated provisional implementation choices](./decisions/2026-11-02-provisional-implementation-autonomy.md).
Do not stop implementation to ask about each gameplay detail below. Choose a
coherent provisional fit and record it; preserve these entries for later review.

The [Eastern Collective tier-1 mirror and its existing numbers](./decisions/2026-11-02-first-playable-scope.md) are approved provisionally. Broader roster/number approvals below concern the remaining content; do not re-block that accepted first-playable subset.

- [ ] Approve the three faction rosters, including the additions to the original design (drop-off structures, the Collective's Airfield, naval structures and units, the Alliance and Collective superweapon structures) — Owner: Borut — Unblocks: faction balance work, real art
- [ ] Approve the first-pass numbers in the unit and structure files (costs, health, weapons) as the starting point for balance. Weapon `versus` values come from the old global damage table (commit `1cb5cd4`) and the examples in [combat-and-balance.md](../design/combat-and-balance.md); burn (5 per second for 3 s), EMP disable (1 s per arc, 3 s per Mobile EMP shell), burst delay (0.2 s) and the Quantum Nexus numbers are new. The Nanite Constructor (1,500 credits, 150 materials) costs three times the other builders — Owner: Borut — Unblocks: duel arena and balance report
- [ ] Set construction cost/time for paid headquarters recovery. The [normal radius, clearance, payment and refund contract](./decisions/2026-11-02-normal-construction.md) is approved; missing headquarters recipes stay unavailable, never free/instant. Starting-kit initialization does not supply paid recovery values — Owner: Borut — Unblocks: paid headquarters recovery
- [ ] Submarines and landing craft appear in [air-and-naval.md](../design/air-and-naval.md) and [units-and-orders.md](../design/units-and-orders.md), and the Aegis Frigate is "weak against Submarines", but no faction has either. Add them to a roster, or drop the mentions — Owner: Borut — Unblocks: naval design
- [ ] The Territorial Control mode's "quantum computing facilities" ([objectives-and-victory.md](../design/objectives-and-victory.md), [story.md](../design/story.md)) aren't a defined neutral structure. Define one, or reuse an existing structure — Owner: Borut — Unblocks: Territorial Control mode
- [ ] Phases: the roadmap completes the Eastern Collective in phase 3, including its aircraft, ships and EMP Blackout Array, but [air-and-naval.md](../design/air-and-naval.md) and [structures.md](../design/structures.md) put naval and superweapons in phase 4, and phase 4 also lists "air and naval". Decide what phase 3 includes — Owner: Borut — Unblocks: phase 3 scope
- [ ] Guard/follow has no default key: G is the ping wheel ([hotkeys.md](../design/hotkeys.md)). Pick a key, or keep it command-card only — Owner: Borut — Unblocks: orders feature
- [ ] The faction docs' Role columns use descriptive names (Economy, Infantry, Detection); the engine roles are in `packages/content/src/rules/roles.ts`. Keep the descriptive names, or show the engine roles — Owner: Borut — Unblocks: nothing urgent
- [ ] Twin-gun sockets: the schema only allows `socket_<name>`, so alternating muzzles can't be `socket_muzzle_0`, `socket_muzzle_1` ([combat-and-balance.md](../design/combat-and-balance.md)). Widen the pattern, or name them `socket_muzzleleft` and so on — Owner: Borut — Unblocks: twin-gun models
- [ ] Small doc conflicts: F1 is both bound and "never bound" in [hotkeys.md](../design/hotkeys.md); [rendering.md](../engineering/rendering.md) draws shield bars on Alliance of Free Nations units, but only Alliance structures have shields; interface strings are put in `packages/client/src/locales/` ([localization.md](../engineering/localization.md)), a folder the architecture layout doesn't have; [skirmish-setup.md](../design/screens/skirmish-setup.md) lets packs change setting defaults, which are engine code; the example mission "Cold Front" in [campaign.md](../design/screens/campaign.md) and [authoring-scenarios.md](../contributing/authoring-scenarios.md) isn't from [story.md](../design/story.md) — Owner: Borut — Unblocks: nothing urgent
- [ ] Art direction sign-off: brick scale, colour palette and one finished reference model per faction — Owner: Borut — Unblocks: refining or replacing the first-pass models, biome colours, icon style
- [ ] Final project name (`open-neo-rts` is the working name) — Owner: Borut — Unblocks: branding, domain, store pages
- [ ] Voice chat in the first multiplayer release, or later — Owner: Borut — Unblocks: TURN hosting, moderation scope

## Pending actions

- [ ] Restore GitHub Actions billing/spending capacity. Jobs in [CI run 41799606413](https://github.com/bobalazek/open-neo-rts/actions/runs/41799606413) did not start because GitHub reported failed payments or a spending-limit block. Local implementation and checks can continue — Owner: Borut — Unblocks: hosted CI qualification
- [ ] Choose hosting for PR previews (needs per-PR URLs) and create the account — Owner: Borut — Unblocks: preview deploy workflow
- [ ] Create the GitHub repository settings: branch protection on `main`, required CI checks, labels from [pull-requests.md](../contributing/pull-requests.md#labels) — Owner: Borut — Unblocks: contributor PRs
