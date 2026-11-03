# 2026-11-03 — Bounded first-playable Shift queues

**Contract.** A unit keeps its current order and at most 32 pending orders. Normal
orders replace current work and clear that unit's pending entries only after
acceptance; refusals preserve both. `append: 1` queues supported move, attack-move,
attack, stop, Hold, harvest, board/unload, deploy, builder assist/repair/salvage and
build commands. Omitted/zero append keeps replacement behavior. Debug commands,
production queues and commander powers do not acquire this modifier. Co-controller
inputs retain canonical command sequence and entity-ID ordering.

**Execution.** Pending jobs are integer ECS rows, not client timers. Capability,
current sight for targets and the appropriate grant are checked on admission;
native authoritative handlers recheck the complete command when it starts. No
pending job pays, refunds, reserves money, claims terrain or grants sight.
Insufficient funds, revoked/expired grants, cooldown and transport capacity wait
with a private reason. Other refusals discard the pending job, retain a private
failure notice and allow later entries to proceed next tick. Each unit starts at
most one queued job per tick. A newer accepted ordinary order clears its pending
jobs. Dead or ownership-changed actors lose pending jobs before victory snapshots.

**Builder groups.** One queued multi-builder build waits until every surviving
participant reaches that shared queue head and finishes its current work. Start
one native build command and pay once, not once per builder. Plain replacement
withdraws that builder; surviving participants can continue. Deleting or moving
a queued build edits the whole shared job. Sites use current placement/radius and
prices when started, so an earlier completed queued building can extend radius
for the next. Never charge a queued invalid site.

**Provisional completion policy.** Move/attack-move/attack and finite work use their
existing authoritative completion/loss rules. Hold remains active until replaced.
A queued Stop clears entries following it. Harvesting yields after its next paid
unload when manual jobs wait; absent/blocked ore/docks or a full bank also permit
queued manual control while preserving cargo. A boarded unit's pending work waits
until ordinary unloading; damaged emergency ejection clears it. Unload replaces
carrier movement once accepted. Queued unloading retries while cargo remains,
blocking following movement until exits clear. Instant deploy jobs advance next tick.

**Presentation.** Current controllers see copied, bounded queues and failures for
the relevant unit/economic/ability scope. Only currently published target handles
are included; fog never updates hidden positions. Selected orders draw one batched
terrain-height line/marker overlay. The normal HUD queues with Shift, shows the
first selected unit's pending entries and supports removing entries or retargeting
move/build waypoints. Right-click friendly sites/damaged structures assigns builder
assist/repair, and a selected producer's ground right-click sets its rally point.
Direct world-marker drag/delete input remains a later interaction polish task;
the HUD exposes the same functional editing commands now.

**Research.** OpenRA's [HarvestResource activity](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Activities/HarvestResource.cs)
separates finite harvesting, cancellation and target-line nodes. Its
[queued-order changelog](https://github.com/OpenRA/OpenRA/wiki/Changelog)
documents Shift queueing and queued target lines. This project retains its own
integer ECS, native handlers, queue cap and provisional haul-yield policy.

**Compatibility.** SIM52 adds canonical pending rows/failure state and optional
append input on supported commands. Scenario headers and affected normal goldens
advance. Authored content, prices, original assets and catalog identities stay
unchanged. Full saves, tactical stances and factory queues beyond FP rally remain
separate phases; this is not a full-game exit claim.
