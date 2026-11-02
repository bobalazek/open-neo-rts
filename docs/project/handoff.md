# Handoff

Snapshot on 2026-11-02. Continue the active roadmap goal; all phases are not complete.
Use [tasks](./tasks.md) and the [phase-2 plan](./phases/2.md).

## Working direction

The owner [delegates missing gameplay choices](./decisions/2026-11-02-provisional-implementation-autonomy.md): choose coherent provisional defaults, record them and implement without repeated approval questions. Preserve accepted content and earlier decisions. Batch checks at coherent feature boundaries. Commit/push/merge are authorized; merge reviewed finished PRs promptly after green CI. Keep unfinished work isolated and available; never cancel agents because another task finishes.

[Performance acceptance is deferred](./decisions/2026-11-02-gameplay-before-performance.md). Do not resume foreground FPS profiling or native-key gates before functional gameplay. Phase 1b remains explicitly unfinished.

## Delivered

Main through PR #192 has SIM27. Phase 0/1a foundations, authored terrain/navigation, worker debug tools, selection/orders and first-pass original assets for all 54 units, 46 structures and 37 props are delivered. Team materials and authored clip validation exist; real combat event playback is separate.

Phase-2 delivery on main includes shared pack identity/compilation and normal kits (#170–172), stock/power (#173–174), paid sites/builders (#175–176), persistent extraction and actual recipe (#177–178), production and authored exits/slots (#179–180), ore stock/regrowth (#181), browser readiness correction (#183), core vision (#184), permitted observations/ghost memory (#185), fog presentation (#186), hauling (#187), actual Supply Truck five-credit/second mining (#188), targeting/private shot intents (#189), selling/paid adjacent repair (#190), and provisional Field Technician repair metadata (#191). Each merged feature passed independent review, repository checks and applicable CI. Combat damage is not supplied by targeting.

The actual Field Technician default is manual adjacent structure repair at 10 HP/second and 25% full-repair credit price. Its [decision](./decisions/2026-11-02-provisional-builder-repair.md) labels this delegated provisional balance. Missing headquarters paid recovery recipes remain unavailable. Normal initialization supports placed headquarters/ground kits, not packed starts or authored map objects.

PR #192 merged deterministic bot seats, private handle/decision/stream/queue continuity and validated same-match restore. Independent review found and closed enemy-target authorization and stale queued-reference restore defects. Integrated repository/content gates and all six CI jobs passed. Shipped policy is explicitly idle; this is not an opposing gameplay AI.

## Current candidates and next work

- The normal local-flow candidate supplies Home → Skirmish → Loading → real controlled worker match, shared Quick start, validated saved setup, pause/leave and cancellation/error/retry cleanup. Its second Force is explicitly uncontrolled. Full original core bytes determine identity at build; missing assets preserve Home/debug and refuse Start. The real HUD is separate task 2-29.
- Active isolated work: projectile flight/contact/damage, the first actual economy/scouting/army bot, and the real match HUD/build/production/control groups. Continue with minimap, combat event playback, defeat/victory/statistics and the remaining phase-2 tasks.

Default routes are Home at `/`, setup at `/skirmish`, active session at `/match`, developer tools at `/debug`, and terrain inspection at `/debug?terrain=1`. Legacy `/?map=...` terrain links remain supported. Browser CI pulls all original core LFS assets for real catalog identity; the code job keeps its small renderer fixture set.

## Verification and limits

The normal-flow candidate passes fix/typecheck/test/build/content validation and six exact Chromium journeys against integrated SIM27: builder construction, extractor power/depletion, paid production, partial-cargo hauling/depot deposit, saved setup/canceled loading/real start, and worker failure/retry. Screenshots show actual original models, team color, fog and the narrow setup layout. Independent source review accepted; final CI is tracked in its PR. No WebGPU hardware or FPS qualification is implied.

There is no completed human-vs-bot skirmish, phase-2 exit or phases 3–5 delivery claim. Build the real earn → build → produce → fight → win/lose loop, then validate its full acceptance and proceed through the roadmap. Raw feature restore is not a full version/content/map-validated save-file implementation.


Task 2-14/initial 2-15 is integrated as SIM28: real instant/bullet/missile shots,
authored damage/delays and deaths, visible actor/projectile events, and same-tick
producer refunds. Three independent review findings were reproduced and fixed;
focused and full repository/content checks pass. Five exact worker journeys now
include rifle damage/death and opaque event actors. Cosmetic events remain human
presentation output and are excluded from canonical bot observations. Non-damage
warheads/statuses, wrecks/salvage and full phase acceptance remain open.


Task 2-24/2-25 first basic policy is integrated under SIM29: real paid build order,
hauling/extraction/production, explored scouting, legal target attacks and retreat.
Only public definitions and permitted copied observations reach AI. Independent
review found and closed structure-centre range handling; full repository/content
batch passes on projectile28. Small original-gameplay fixture proof is not full
Training Grounds or complete-match acceptance. Normal UI opponent activation and
qualification remain 2-24b; full defeat/statistics/post-match work remains open.


Task 2-22a implements SIM30 defeat/surrender/team result and terminal freeze.
Independent review closed a terminal replay-loop hang; the shared replay/trace
regression requests1000 ticks, ends at1, validates the trace and rejects later
commands. Full integrated repository/content checks pass on projectile/basic-bot
code. Statistics/APM, full save restoration and results UI are separate tasks.
