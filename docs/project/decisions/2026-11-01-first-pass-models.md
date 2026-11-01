# 2026-11-01 — First-pass models before the art sign-off

**Context.** Generated placeholder blocks were removed, and real art waits on the art-direction sign-off ([human-tasks.md](../human-tasks.md)). Debug mode needs units that can be told apart, with the parts, sockets and clips their definitions list, so turrets, muzzles and animations can be tested.

**Decision.** Make **first-pass models** by hand, as original blocky brick models following the [model conventions](../../contributing/assets.md#model-conventions), starting with the tier-1 Eastern Collective units and structures (the first playable's roster). They aren't generated placeholders and they aren't final art.

**Consequences.** Art PRs start in phase 1b, and the model validator checks them like any other model. When the art direction is signed off, models are refined or replaced one PR at a time; brick scale and palette may change. Each model needs a real author in `assets.json`.
