# Handoff

Snapshot on 2026-11-02. Use [tasks](./tasks.md) and the [phase-2 plan](./phases/2.md) for current work. The owner wants functional gameplay now, with validation at coherent batch boundaries.

## Current direction

The owner [explicitly deferred performance work](./decisions/2026-11-02-gameplay-before-performance.md). Do not resume FPS profiling or desktop benchmarks as an entry gate. Phase 1b remains unfinished; this is permission to proceed with gameplay, not a phase-completion claim.

The owner approved the [existing Eastern Collective tier-1 roster and numbers provisionally](./decisions/2026-11-02-first-playable-scope.md) for the Training Grounds mirror. The [normal construction contract](./decisions/2026-11-02-normal-construction.md) is also accepted: six/three-cell provider radius, 40-tick friendly clearance, full payment at valid site creation and full unfinished cancellation refund. Do not ask for those decisions again.

## Delivered and in progress

- Phase 0/1a foundations are complete. Debug mode has authored terrain, navigation, selection/orders, inspectors, worker hosting and copied projections. All existing 54 units, 46 structures and 37 props have first-pass assets; team-color and animation validation is integrated.
- [PR #170](https://github.com/bobalazek/open-neo-rts/pull/170) merged shared pack resolution and gameplay/cosmetic identity, with all six CI jobs green.
- [PR #171](https://github.com/bobalazek/open-neo-rts/pull/171) merged integer gameplay compilation, with all six CI jobs green. CLI validation compiles 137 definitions and validates 137 models/833 assets. Compilation does not make every faction playable.
- [PR #172](https://github.com/bobalazek/open-neo-rts/pull/172) merged SIM10 normal starting kits: 14 real entities, no debug commands, canonical setup/grants/teams/settings and validated placement/reachability. All six CI jobs passed; the new worker journey passed all three engines. Its old terrain-picker timeout passed unchanged on one retry.
- [PR #173](https://github.com/bobalazek/open-neo-rts/pull/173) merged SIM11 ECS stock banks, atomic permission-checked spending, authoritative gain/refund helpers and private bank projections. Local full gates, the focused worker journey and all six CI jobs passed. An ancestry-only rebase retained the exact tested Git tree.
- Task 2-05 supplies SIM12 power state, manual toggles, brownout operational helpers, incomplete-site exclusion and private power projections. Independent review, local full gates and the worker toggle journey pass; branch publication/CI follows. A stale authored War Factory power field in the checked-in CLI fixture was corrected, with existing debug state goldens preserved. Production/research/defense/radar consumers are later work, not implemented by these helpers.
- Task 2-09 construction placement/payment is being implemented against bank/power. Its accepted radius and clearance work also closes the overlapping 1B-42/1B-43 clauses. Builder work/completion, harvesting, production queues, combat and the bot remain subsequent work.

The normal initializer currently supports faction-start maps, one placed headquarters and ground starters, with no authored map objects. It does not supply missing paid headquarters recovery recipes. Normal stock/power features keep outcome state in ECS and reject debug commands.

## Next functional delivery

Complete paid site placement/cancellation and friendly clearance, then builder work/completion and unit production. Implement ore logistics and the shared extractor's approved operating contract once its missing values are settled. Continue toward the real build → earn → produce → fight → win/lose loop against a bot, using the existing models and animation system. Home/skirmish/HUD and gameplay animation triggers still need implementation.

Pending owner decisions are in [human tasks](./human-tasks.md): notably extractor price/time/rates/depletion, exact ore logistics/regrowth values, missing headquarters recovery values, structure targeting and unresolved signature/balance details. Do not silently replace missing values with free construction or invented rates.

## Validation and deferred work

Use one task/branch/PR and merge finished reviewed work promptly after CI. Run focused regressions for concrete new logic; repository/content checks at the end of each coherent batch. Advance simulation version and affected scenario headers/goldens with outcome changes. Preserve debug hashes when debug outcomes are unchanged. Keep unfinished work isolated and handed off; do not cancel agents merely because another task finished.

The 60 fps gate remains unmet. Earlier qualified baseline was 50.373 fps; an isolated matrix-cache candidate measured 41.499 fps, and a later baseline 47.601 fps. These were not a completed matched pair and establish no causal improvement/regression. The candidate is not on main. Its source and evidence remain on `codex/model-world-cache` and local capture artifacts. Native browser/OS key acceptance also remains open.

No bot skirmish, completed phase-2 exit or phases 3–5 delivery is claimed. Follow the roadmap after the first local match works.
