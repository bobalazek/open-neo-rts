# Handoff

Snapshot on 2026-11-02. Continue the active roadmap goal; all phases are not complete.
Use [tasks](./tasks.md) and the [phase-2 plan](./phases/2.md).

## Working direction

The owner [delegates provisional gameplay choices](./decisions/2026-11-02-provisional-implementation-autonomy.md): choose a coherent fit, record it and implement without routine approval questions. Preserve accepted content/earlier choices. Batch checks at feature boundaries. Commit/push/merge are authorized; merge reviewed finished work after green CI. Never cancel unfinished agents because other work finishes.

[Performance acceptance is deferred](./decisions/2026-11-02-gameplay-before-performance.md). Do not resume foreground FPS/native-key profiling before functional gameplay. Preserve the owner's servers on4320/4318. Phase1b's deferred acceptance is still open.

## Delivered on main

Main through PR #206 (`0e19a2e`) uses SIM32. Home/Quick start → real human Force versus the basic Eastern Collective bot → canonical result → fresh rematch/Home works. Economy/build/production, hauling/extraction, fog/vision, targeting/projectiles/damage/death, hosted bots, victory/surrender, HUD/control groups/minimap and actual final production/combat/resource totals are connected. Initial kits/stock and voluntary removals are excluded from those totals; income/spending/refunds remain separate.

PR #203 displays frozen per-Force totals with keyboard-accessible narrow scrolling. PR #204 fixes immediately loaded model picking before the next scene frame. PR #205 allows25 aggregate CI browser minutes; no workload/assertion or individual deadline changed. PR #206 adds acknowledged pause/menu, real0.75/1/1.5/2 pacing, Esc priority, confirmed restart/leave, shared surrender, objectives/current-controls help and shared Home/in-match device settings. Live graphics/UI scale/camera/edge/zoom-motion previews cancel correctly, persist on successful writes and roll back on failed writes. Browser Back discards unsaved preview before disposal. Save/load, audio and full rebinding remain explicitly unavailable; F1 is unresolved.

Original first-pass assets cover54 units,46 structures and37 props. Team materials and required idle/movement/armed/death clip contracts are delivered. Permitted combat events drive attack/recoil/death clips, working-builder motion, health/work bars, flight/impact/damage effects; fog revokes retained cosmetic actors. All137 definitions compile;833 assets validate. Models do not mean every faction or ability is playable.

## Evidence

Shared menu/results/picking candidate45a62cd passed repository verification and Chromium/Firefox/WebKit in [CI41487961899](https://github.com/bobalazek/open-neo-rts/actions/runs/41487961899); content was appropriately skipped there, with local full validation passing. Merged source matches the tested non-documentation tree; only the explanatory CI-budget documentation differs. Independent reviews accepted all four PRs.

Integrated menu/results: six Chromium journeys passed together47.8s, followed by the concrete browser-Back preview regression6.3s and independent identical probe. Twelve earlier unique normal-worker/HUD/minimap/setup/menu/settings cases passed. Inspected desktop menu, narrow150% settings and final totals. Normal goldens remain ea8691a2ee5b2888 / b2cfa6f8e3c37a56; debug hashes unchanged. Gameplay identity a76a627d0f2f3aad, cosmetic e6a4c6a7a090f880.

## Reviewed delivery queue

The current shared candidate is PR #209 at139c3000ec03a7bfb8459b6e447504a9e0fba8a5,
running [CI41495111537](https://github.com/bobalazek/open-neo-rts/actions/runs/41495111537).
It includes #207+#208+#209. Earlier #207/#208 runs failed only the expanded
minimap journey: a real-worker probe confirmed a legitimate short-lived order,
and their90-second total deadline was exhausted. The reviewed correction captures
bounded actual own-actor order signatures and separates ping interactions; both
90-second deadlines are unchanged and the revised pair passed19.0s locally.
Do not blindly retry the superseded old source. Merge after the shared batch is
green, preserving own commits on each rebase after squash. All production source
and tests match the shared candidate; subsequent handoff edits are documentation.

- PR #207: own-Force notices and local pings (task2-30b). Eight notices track observed damage, actual unit/site completion and permitted prior-owned deaths; disappearance alone is not a loss. Visible clickable feed, Space cycling and minimap rings use only copied permitted observations. Five local ping kinds use Alt-click or a keyboard-accessible camera-location button in explored legal cells. [Presentation defaults](./decisions/2026-11-02-local-force-notices.md):20 simulation seconds, five-second repeated-damage coalescing. Full repository gates, six model cases43 assertions and eight unique integrated menu/results/minimap journeys passed. Final minimap11.2s, desktop/narrow images inspected, source/layout reviews accepted. CI41489811848; merge after green. Source rebase onto main changed only CI documentation.
- PR #208: headless real-match runner (task2-40a), based on #207. `bun neo ai-vs-ai --out <new-directory> [--seeds 1,2,...] [--ticks 30000]` uses actual core/map bytes, default normal kits/rules and two hosted bots. Each seed runs twice comparing hashes/checkpoints/outcomes/diagnostics, preserves inputs/first failures and refuses existing directories. Capped games stay incomplete/nonzero; no save/keyframe/viewer/balance claim. Repository/content gates and independent source review passed. CI41491138993; finish after #207. A bounded ordinary test covers real setup, caps, standard replay checkpoints and overwrite refusal; long qualification is a separate explicit command.

## Running qualification: leave it running

SIM32 default20-seed batch: `/tmp/neo-ai-qualification-sim32-20261102`, log `/tmp/neo-ai-qualification-sim32.log`. Tool exec session56672. Each match runs twice and can take minutes; do not restart merely because an observation window expires. Results update summary.json after each seed.

- Seed1: cap30000, no winner, reproducible hash e9cbaa12f14aa4b4. Incomplete.
- Seed2: natural victory at26331 ticks (~21m57s), winnerteam1, reproducible hash ee39d4b098385aa0. No injected income/spawns/surrender/external orders.

The batch is not finished. Preserve capped/failing evidence and investigate actual stalls; do not call this20 completed games or a human playtest. Earlier SIM30 trial artifacts remain `/tmp/neo-skirmish-opponent-seed{1-18000,2-30000}.json`; their hashes are historical, not current goldens. One truck's no_ore recovery remains limited.

## Continue

PR #209/task2-35a adds terminal input-record export/download and strict headless replay
verification. Real paid production followed by surrender downloaded a record
whose hosted bot/setup/external inputs reproduced the exact terminal hash in Bun.
Running-match export is refused. Wrong versions/hash/tick, malformed records and
explicit hosted-bot commands are rejected. This is not full-save/keyframe/metadata
or viewer completion; continue2-35b after validated snapshot restore.
Independent review's refused-input invariant finding was fixed and independently
reproduced as rejected. Two core cases16 assertions pass; the authentic downloaded
record still verifies tick231/hash2111732313edace5 after the fix. Full accepted
repository tests pass. Review accepted; no further source changes are pending.

Finish/merge the reviewed queue, preserving each PR's own commits when rebasing after squash. Continue non-damage effects, wreck/salvage and lifecycle presentation, required tier1 modes/transport/industrial bonuses/veterancy and complete orders; then validated save/restore/replay, audio/help/content tools and exit evidence. Individual World/bot restore is not a complete save. Full replay files/viewer, per-type/APM/history and a real human-versus-bot completion remain open. The detailed phase plan is authoritative; phase2 and phases3–5 are not complete.

Routes: `/`, `/settings`, `/skirmish`, `/match`, `/debug`, `/debug?terrain=1`; legacy `/?map=...` remains supported. CI pulls original core LFS bytes for actual catalog identity. Never replace assets with pointers or synthetic identity bytes; incomplete installs preserve Home/debug and refuse Start.
