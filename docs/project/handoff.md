# Handoff

Snapshot on 2026-11-02. Continue the active roadmap goal; all phases are not complete.
Use [tasks](./tasks.md) and the [phase-2 plan](./phases/2.md).

## Working direction

The owner [delegates provisional gameplay choices](./decisions/2026-11-02-provisional-implementation-autonomy.md): choose a coherent fit, record it and implement without routine approval questions. Preserve accepted content/earlier choices. Batch checks at feature boundaries. Commit/push/merge are authorized; merge reviewed finished work after green CI. Never cancel unfinished agents because other work finishes.

[Performance acceptance is deferred](./decisions/2026-11-02-gameplay-before-performance.md). Do not resume foreground FPS/native-key profiling before functional gameplay. Preserve the owner's servers on 4320/4318. Phase 1b's deferred acceptance remains open.

## Delivered through PR #209

The delivered batch uses SIM32. Home/Quick start → real human-controlled Force versus the basic Eastern Collective bot → canonical result → fresh rematch/Home works. Economy/build/production, hauling/extraction, fog/vision, targeting/projectiles/damage/death, hosted bots, victory/surrender, HUD/control groups/minimap and actual final production/combat/resource totals are connected. Initial kits/stock and voluntary removals are excluded from totals; income/spending/refunds stay separate.

- #203: final per-Force totals, with keyboard-accessible narrow scrolling.
- #204: immediately loaded model picking before the next scene frame.
- #205: 25 aggregate CI browser minutes, preserving browser workloads/assertions and individual journey deadlines.
- #206: native pause/menu, real 0.75/1/1.5/2 pacing, Esc priority, confirmed restart/leave, shared surrender, objectives/current-controls help and shared Home/in-match device preferences. Live graphics/UI-scale/camera/edge/zoom-motion previews cancel, persist or roll back on failed writes. Browser Back discards unsaved preview before disposal. Save/load, audio and full rebinding remain unavailable; F1 is unresolved.
- #207: eight recent own-Force notices, a visible clickable feed, Space cycling, minimap rings and five local ping types. Inputs are copied permitted observations: own health decreases, actual unit/site completion and permitted prior-owned deaths; disappearance alone is not a loss. Alt-click and keyboard-accessible camera-location pings require explored legal cells. Offline pings are explicitly local. [Presentation defaults](./decisions/2026-11-02-local-force-notices.md): 20 simulation seconds and five-second repeated-damage coalescing.
- #208: `bun neo ai-vs-ai --out <new-directory> [--seeds 1,2,...] [--ticks 30000]`. Actual core/map bytes, default normal kits/rules and two hosted bots; each seed runs twice comparing hashes/checkpoints/outcomes/diagnostics. Preserve inputs/first failures and refuse existing output directories. Caps stay incomplete/nonzero. This is not a balance claim, full save or replay viewer.
- #209: normal terminal input-record download and strict headless replay verification. Only accepted external inputs are recorded; hosted bots regenerate. The verifier rejects wrong versions, malformed records, refused inputs, explicit hosted-bot commands and mismatched terminal tick/hash. Active-match export is refused. Full installed-pack/cosmetic/creation metadata, snapshot keyframes, seeking and the interactive viewer remain 2-35b.

Original first-pass assets cover 54 units, 46 structures and 37 props. Required team-material/idle/move/armed/death contracts are delivered. Permitted combat events drive attack/recoil/death clips, working-builder motion, health/work bars, flight/impact/damage effects; fog revokes retained cosmetic actors. All 137 definitions compile and 833 assets validate. Models do not mean every faction or ability is playable.

## Accepted evidence

All six jobs passed in [CI 41497184040](https://github.com/bobalazek/open-neo-rts/actions/runs/41497184040) on candidate 9f3b094eeba85a07528139bcff3cc21d5dc421d6: repository verification, content and Chromium/Firefox/WebKit. Rebased delivery trees match this candidate's production and test source; only this handoff differs. Independent reviews accepted the features and concrete fixes. Normal goldens remain ea8691a2ee5b2888 / b2cfa6f8e3c37a56; debug hashes unchanged. Gameplay identity a76a627d0f2f3aad, cosmetic e6a4c6a7a090f880.

Menu/results: six Chromium journeys passed together in 47.8s, plus the browser-Back preview regression in 6.3s and independent identical probe. Prior normal-worker/HUD/minimap/setup/menu/settings coverage passed. Desktop menu, narrow 150% settings and final totals were inspected.

The minimap CI failures in earlier candidates exhausted the original journey's 90-second budget. An independent real-worker probe showed an accepted attack-move appearing for about 1.85 seconds, then arriving and correctly displaying idle. Tests now capture at most 32 real own-actor order signatures, retaining exact Force/definition/type/target and HUD/focus/bank/selection/resize/cleanup checks. Ping interactions have their own journey; both 90-second deadlines remain. The revised pair passed in 19.0s locally and the complete CI batch passed. [Learning](./learnings/2026-11-02-observe-short-lived-orders.md).

The original-core CLI integration exceeded Bun's default five seconds in CI. It now reuses the CLI's genuine scenario artifact instead of loading/hashing the same pack twice, retains all 29 assertions and actual double trials, and uses the existing 15-second cold CLI-integration precedent. Production runner behavior is unchanged. Independent review and final CI accepted.

Replay records: two core cases, 16 assertions, plus actual paid production → surrender → download → Bun verification. The authentic browser file reproduces tick 231/hash 2111732313edace5, including the hosted bot. Independent review found and verified closure of a refused-input invariant gap. Terminal-race/rematch journeys and desktop/narrow Save replay UI also passed.

## Running qualification: leave it running

SIM32 baseline batch: `/tmp/neo-ai-qualification-sim32-20261102`; log `/tmp/neo-ai-qualification-sim32.log`; tool exec session 56672. Each match runs twice and can take minutes. Do not restart because an observation window expires. `summary.json` is authoritative and updates per seed; do not rewrite docs for every result.

Seed 1 capped at 30,000 ticks with no winner and reproducible hash e9cbaa12f14aa4b4. Seed 2 naturally ended at 26,331 ticks (~21m57s), winner team 1, reproducible hash ee39d4b098385aa0. Several later seeds also capped; the batch is still running. No injected income/spawns/surrender/external orders were used. Preserve incomplete evidence and investigate actual stalls; do not claim 20 completed matches or a human playtest. Historical SIM30 artifacts remain `/tmp/neo-skirmish-opponent-seed{1-18000,2-30000}.json`; those hashes are not current goldens. One truck's no_ore recovery is limited.

## Isolated ongoing work

`/tmp/neo-unit-modes`, branch `codex/unit-modes`, has UNCOMMITTED task 2-43 work. It is not in main or an accepted feature. It starts SIM33, updates the three scenario headers, and adds typed single deploy-mode metadata, granted toggle/cooldown/payment state, immutable stat overlays, movement locking, launch-snapshotted damage and public-mode/private-cooldown projection/HUD wiring. Compile-derived modes require explicit self/mobile-zero metadata. Existing Dragon Tank/APC content has not yet been activated or corrected; neither mode is currently a claimed working release feature.

Finish that coherent feature before tests/review/publication: inspect projectile handoff of damageBonus, complete UI/wire/input and authored metadata, add meaningful mode/grant/money/flight/replay cases, update affected normal goldens and run one batched repository/content/browser check. Debug hashes should stay unchanged. Keep original faction/unit names. The owner's descriptions specify Dragon Tank +3 range/+25% damage/immobile (its older range-percent effect conflicts) and APC +50% armor/immobile; cooldowns are already three seconds. Record missing interpretations as provisional instead of asking. [OpenRA's deploy-condition model](https://docs.openra.net/en/release/traits/#grantconditionondeploy) was consulted as an implementation pattern; it is not a source of our balance values or code.

Continue non-damage effects, wreck/salvage/lifecycle presentation, required tier-1 modes/transport/industrial bonuses/veterancy and complete orders; then validated save/restore/replay, audio/help/content tools and exit evidence. Individual World/bot restore is not a complete save. Full replay files/viewer, per-type/APM/history and a real human-versus-bot completion remain open. Phase 2 and phases 3–5 are not complete.

Routes: `/`, `/settings`, `/skirmish`, `/match`, `/debug`, `/debug?terrain=1`; legacy `/?map=...` remains. CI pulls original core LFS bytes for actual identity. Never replace assets with pointers/synthetic identity bytes; incomplete installs preserve Home/debug and refuse Start.
