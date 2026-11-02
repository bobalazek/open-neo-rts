# 2026-11-02 — Provisional first Eastern Collective bot

**Context.** Bot-seat hosting is implemented. The owner delegated missing policy
choices so the first real opponent can be built and tuned afterward.

**Implementation defaults.** Use the existing tier-1 Eastern Collective roster.
Build Reactor, Supply Depot, Barracks Complex and War Factory, then a discovered
material extractor. Aim for two builders, two trucks and at most 24 combat troops.
Scout before a six-unit wave is ready; retreat at 35% health and resume at 55%.
Plan every ten ticks, retry rejected placement after 40 ticks and lost goals after
400. Allow stalled sites 200 ticks plus twice observed straight-line builder
travel time. Keep three-cell building/node lanes for truck exits and move idle
reserve units away from production doors. These are provisional policy defaults,
not changes to authored unit prices or performance claims.

**Research.** OpenRA documents separate base-building and harvester modules, and
its Red Alert rules configure unit-building and squad modules separately:
[trait documentation](https://docs.openra.net/en/release/traits/),
[AI rules](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/ai.yaml).
That separation informs the organization; this implementation is original and
uses this repository's commands, counted budgets and authored roster.

**Consequences.** All memory/cursors/pending decisions/randomness remain canonical.
Only copied permitted entities, explored static node origins and immutable public
definitions reach the policy. No World, live path probes, stock oracle or hidden
base coordinates are supplied. A small original-gameplay fixture proves the
paid economy-to-tank chain; authored-map and full-match acceptance remain open.
