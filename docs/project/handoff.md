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
- [PR #174](https://github.com/bobalazek/open-neo-rts/pull/174) merged SIM12 power state, toggles, brownout operational helpers and private projections. Independent review, local full gates, the worker toggle journey and all six CI jobs pass; the old terrain-picker timeout passed unchanged on one retry. Actual production/research/defense/radar consumers remain later work.
- [PR #175](https://github.com/bobalazek/open-neo-rts/pull/175) merged paid construction sites and clearance, including 1B-42/1B-43, at `fc264a7`. Independent review, repository/content/worker checks and all six CI jobs pass. The ancestry-only rebase after #174 retained identical complete Git tree.
- [PR #176](https://github.com/bobalazek/open-neo-rts/pull/176) implements SIM14 builder approach, quarter-work, assistance, stop/resume and completion. Completed structures retain their paid receipt, activate power and reject unfinished cancellation. Independent review, full repository/content gates and the real worker journey pass; final CI is pending.
- [PR #177](https://github.com/bobalazek/open-neo-rts/pull/177) implements SIM15 persistent node extraction and private status against builder completion. Independent review, full repository/content checks and both worker journeys pass; final CI is pending. Task 2-08b separately activates the approved actual extractor JSON and authored expectations under SIM16.

The normal initializer currently supports faction-start maps, one placed headquarters and ground starters, with no authored map objects. It does not supply missing paid headquarters recovery recipes. Normal stock/power features keep outcome state in ECS and reject debug commands.

## Next functional delivery

Implement unit production with the approved two Barracks Complex slots and one elsewhere. Node extraction is implemented in an isolated candidate awaiting builder integration/final checks; its engine/schema and approved balance activation publish separately. The [extractor economy](./decisions/2026-11-02-extractor-economy.md) and [ground weapons targeting structures](./decisions/2026-11-02-ground-targets-structures.md) are approved. Continue toward the real build → earn → produce → fight → win/lose loop against a bot. Home/skirmish/HUD and gameplay animation triggers still need implementation.

Pending owner decisions are in [human tasks](./human-tasks.md): notably exact ore logistics/regrowth values, missing headquarters recovery values and unresolved signature/balance details. Do not silently replace missing values with free construction or invented rates.

## Validation and deferred work

Use one task/branch/PR and merge finished reviewed work promptly after CI. Run focused regressions for concrete new logic; repository/content checks at the end of each coherent batch. Advance simulation version and affected scenario headers/goldens with outcome changes. Preserve debug hashes when debug outcomes are unchanged. Keep unfinished work isolated and handed off; do not cancel agents merely because another task finished.

The 60 fps gate remains unmet. Earlier qualified baseline was 50.373 fps; an isolated matrix-cache candidate measured 41.499 fps, and a later baseline 47.601 fps. These were not a completed matched pair and establish no causal improvement/regression. The candidate is not on main. Its source and evidence remain on `codex/model-world-cache` and local capture artifacts. Native browser/OS key acceptance also remains open.

No bot skirmish, completed phase-2 exit or phases 3–5 delivery is claimed. Follow the roadmap after the first local match works.
