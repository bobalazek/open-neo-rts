# Handoff

Snapshot on 2026-11-02. Continue the active roadmap goal; all phases are not complete.
Use [tasks](./tasks.md) and the [phase-2 plan](./phases/2.md).

## Working direction

The owner [delegates missing gameplay choices](./decisions/2026-11-02-provisional-implementation-autonomy.md): choose coherent provisional defaults, record them and implement without repeated approval questions. Preserve accepted content and earlier decisions. Batch checks at coherent feature boundaries. Commit/push/merge are authorized; merge reviewed finished PRs promptly after green CI. Keep unfinished work isolated and available; never cancel agents because another task finishes.

[Performance acceptance is deferred](./decisions/2026-11-02-gameplay-before-performance.md). Do not resume foreground FPS profiling or native-key gates before functional gameplay. Phase 1b remains explicitly unfinished. Preserve the owner's existing servers on4320/4318.

## Delivered

Main through PR #202 has SIM31 and the first connected local skirmish flow:
Home/Quick start → Skirmish → Loading → actual human-controlled Force versus the
basic Eastern Collective bot → canonical result → fresh same-setup rematch/Home.
This functional flow is not the complete phase-2 acceptance or all roadmap phases.

Original first-pass assets cover54 units,46 structures and37 props. Team materials,
idle/movement and authored clip validation are delivered. Actual permitted combat
events now drive attack/recoil/death clips, working-builder playback, health/work
bars, projectiles, impacts and damage labels. Fog revokes retained cosmetic actors
and effects; hidden cells cannot connect a projectile trail.

Normal gameplay includes content identity/integer compilation and starter kits;
stock/power; paid construction, real builder work and refunds; node extraction;
queues, authored exits, Barracks parallel slots and rallies; finite ore,
regrowth/hauling/docking; selling and paid adjacent repair; sight/cliffs/opaque
props, enemy observations, remembered structures and fog; targeting, integer
projectiles, damage/death; canonical hosted bots; team defeat, surrender and
terminal freeze. HUD build/production/orders, control groups and permitted minimap
pan/zoom/Home use real worker commands. Normal Home/Skirmish activates seat2's
actual bot; the second Force is no longer idle or uncontrolled.

Important recent deliveries: #194 HUD, #195 projectile damage/death, #196 basic
policy, #197 canonical results, #198 combat playback, #199 minimap, #200 normal
opponent activation and #202 result/rematch UI. Exact scope and remaining clauses
live in the phase plan rather than the existence of a model or setting.

## Evidence and limits

The assembled SIM31 code passed fix/typecheck/test/build/content validation and
[all six CI jobs](https://github.com/bobalazek/open-neo-rts/actions/runs/41474451118).
Five integrated Chromium journeys passed32.3s: real HUD payments/refunds, minimap
orders/resize/box selection, original GLB combat playback, actual paused surrender
and fresh-worker rematch/Home, and the late surrender/result ordering regression.
Independent implementation and integration reviews accepted. Desktop/narrow images
were inspected. Result UI's complete non-documentation tree matches that CI build.

Authored Training Grounds r8/core137 gameplay was trialled at84e46b0 before the
SIM31 bump: seed1 capped18,000ticks without result (a8ebd6748087cdf4); seed2 naturally
ended at26,331ticks (~21m57s), winner team1, Force0 annihilated, final/checkpoint
10627ead88484203. No injected income, spawns, surrender or external orders were
used. These are explicitly SIM30 AI-vs-AI trial hashes, not SIM31 goldens, a human
playtest, a replay verification or20-game acceptance. Raw local artifacts remain
at /tmp/neo-skirmish-opponent-seed{1-18000,2-30000}.json. One truck's no_ore recovery
remains limited; the successful run still maintained actual income and produced
six surviving Dragon Tanks.

## Current work and next steps

PR #201 contains independently reviewed canonical production/combat/resource totals
under SIM32, with normal goldens ea8691a2ee5b2888/b2cfa6f8e3c37a56 and unchanged debug
hashes. Repository/content checks, focused money/privacy/freeze/wire cases and five
real-worker journeys passed. Its final CI is41477024705; merge after green and
resolve only the current documentation adjacency. Then show the real frozen totals
on the result screen; do not fabricate score/APM/graphs.

Continue the in-game menu/settings, alerts, non-damage effects, wreck/salvage,
required tier-1 signatures/abilities and veterancy, full version/content/map-checked
save/restore/replay, audio/help/tooling and the phase exit. Feature-level World or
bot restore is not a complete validated save file. Replay hash,20 recorded complete
AI matches, every tier-1 feature and a real human-versus-bot match remain acceptance
work. Phase2 and phases3–5 are not complete.

Routes: `/`, `/skirmish`, `/match`, `/debug`, `/debug?terrain=1`; legacy `/?map=...`
terrain links remain supported. Code/browser CI pull original core LFS bytes for
actual catalog identity and authored setup; never replace them with pointers or
synthetic identity bytes. Missing assets preserve Home/debug and refuse Start.
