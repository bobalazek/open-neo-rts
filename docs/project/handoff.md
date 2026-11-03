# Handoff

Snapshot on 2026-11-02. Continue the active roadmap goal; all phases are not complete.
Use [tasks](./tasks.md) and the [phase-2 plan](./phases/2.md).

Current main uses SIM40 through PR #217, including Siege/Bunker modes, APC
transport/passenger fire, improved bot goals, EMP and attached burn/beam weapons.
SIM41 reactor adjacency is the next candidate below. This is functional
phase-2 progress, not all-phases completion.

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

## Finished SIM32 qualification: preserve the evidence

SIM32 baseline batch: `/tmp/neo-ai-qualification-sim32-20261102`; log `/tmp/neo-ai-qualification-sim32.log`. The batch finished all 20 double trials with reproducible hashes. One match completed and 19 capped at 30,000 ticks, so the runner correctly exited nonzero. No process remains to poll; preserve `summary.json`, scenarios and both results rather than restarting or overwriting them.

Seed 1 capped at 30,000 ticks with no winner and reproducible hash e9cbaa12f14aa4b4. Seed 2 naturally ended at 26,331 ticks (~21m57s), winner team 1, reproducible hash ee39d4b098385aa0. Every other seed capped. No injected income/spawns/surrender/external orders were used. Investigate actual stalls before claiming 20 complete matches or human acceptance. Historical SIM30 artifacts remain `/tmp/neo-skirmish-opponent-seed{1-18000,2-30000}.json`; those hashes are not current goldens. One truck's no_ore recovery is limited.

## Deploy-mode delivery batch

`/tmp/neo-unit-modes` holds two stacked tasks: core engine PR #210 (`codex/unit-modes`, SIM33), merged at 38a8fcacc25a89d8d17a5eacd3458884c3c15d46, and faction activation PR #211 (`codex/eastern-collective-deploy-modes`, SIM34). They add one typed data-defined self mode, granted toggle/cooldown/payment state, immutable stat overlays, movement locks, launch-snapshotted damage and public-mode/private-cooldown projection/HUD wiring. Compile-derived modes require explicit self/mobile-zero metadata. Dragon Tank encodes its described +3 range/+25% damage/immobility, correcting the older conflicting range-percent effect; APC encodes +50% armour/immobility. Existing cooldowns remain three seconds and absent costs remain free. [Provisional interpretations](./decisions/2026-11-02-provisional-deploy-modes.md) preserve original names and base unit balance.

Core independent review accepted grants/atomic money, all movement entry points, delayed projectile bonus/current armour, private cooldown copies and replay. Both slices passed independent review and fix/typecheck/test/build/content checks; normal goldens become 99f77ed61a69f942 / 85b27d7835d79283, debug unchanged. The authored activation's real-catalog worker/HUD Chromium proof passed in 2.2 seconds: mixed deploy, visible ability names, cooldown, move/attack-move immobility, contextual D pack, resumed motion and terminal replay verification. Only the test fixture expands starting kits; its renderer callbacks are stubbed, so this is not transformation/visual proof. Current validated identities: gameplay 5dd7fff073575ff9, cosmetic 6f8bfdba214a6b60; 137 definitions/833 assets. All six jobs passed in [CI 41504706792](https://github.com/bobalazek/open-neo-rts/actions/runs/41504706792) at 6474e55eb983071bd0404aa8737a126708a792df. After squash rebasing, production/tests match that candidate exactly; only handoff docs differ. Authored transformation playback, disable integration and APC cargo/passenger fire remain tracked work.

## Delivered ground transport

`/tmp/neo-apc-transport`, branch `codex/apc-transport`, contains committed SIM35 task 2-44a code rebased onto merged mode main d24318b327c5df0b5e496fb9113f6f7082165a3e. It adds same-Force foot boarding/reservations, removed spatial presence with retained identity/health/population, private copied manifests, legal local unload and ground-death ejection, normal worker routing and Board/U HUD wiring. Ground capacity uses the authored five APC slots; no production starting kit, base balance or model bytes change. Exit search is bounded and cannot cross cliffs/static blockers. Normal blocked unload retains cargo; blocked emergency cargo records actual own loss without a fabricated public exit/death marker.

Independent review accepted the bounded lifecycle after concrete fixes for delayed direct-target crashes, loaded-builder construction payment, mid-cell boarding, retired-carrier approach crashes, stale movement failures and hidden-cargo death-event leakage. Exact probes remain `/tmp/neo-transport-{spatial,builder,retired-carrier,old-failure}-review.ts` with before/after logs. Permanent regressions genuinely failed before correction; final transport cases are seven tests/57 assertions, plus strict private wire validation. Motion reset is checked before the automatic movement baseline refresh. Original-catalog worker/HUD proof passed in 2.7 seconds: three Collective Soldiers/two Field Technicians board into five slots and U unload restores all five. The fixture stubs renderer picking; it is not visual proof. Its two harness corrections preserve behavior: use the existing acceptance text and await the actual cargo snapshot rather than an immediately busy-disabled button.

Final fix/typecheck/test/build/content validation passed; 137 definitions/833 assets, identities unchanged from SIM34. Debug and minimal normal fixture goldens remain unchanged from the mode batch. All six jobs passed in [CI 41508558546](https://github.com/bobalazek/open-neo-rts/actions/runs/41508558546) at 814401c667a568fedab63723bc45720836c15b69; PR #212 merged at 96ae77b1feaa5e6657bc1a902efe4f8876e193ec with an identical source tree. Transformation visuals/disable integration (2-43c) and the remaining phase-2 tasks stay open.

## Passenger-fire delivery candidate

`/tmp/neo-bunker-fire` holds the faction child `codex/eastern-collective-passenger-fire` after engine PR #213 (`codex/bunker-fire`, rebased head 3decacd99b402aba2fce12b4d54090c19398106b; matching engine worktree `/tmp/neo-bunker-core`). The engine adds strict raw/compiled/runtime `transport.fireWhileDeployed` capability and owner-only cargo firing state. SIM36 snapshots effective shot range alongside passenger weapon/bonus, while the physical carrier owns trace exemptions/public effects. Loaded infantry keep private aim/reload, gain no spatial presence/sight/work and use current Force sight. Carrier attack/stop, packing and release cannot reset reloads or retain a stale burst. Ground-only metadata without a deploy mode is rejected. The faction child uses SIM37 and enables the flag only on the original APC; no weapon/base number, production kit or asset bytes change.

Engine and activation passed independent bounded review. New regressions cover own weapon range/damage versus carrier bonuses, packed/unload reload retention, sight/privacy, private forward aim, stop/burst cancellation, in-flight persistence after carrier death and a real normal-start-kit mounted-combat terminal replay. The latter initially assumed the unarmed APC would be auto-targeted; `/tmp/neo-bunker-record-diagnosis.log` instead proved existing threat priority correctly selected the armed foot actor, reducing its health to 90 while leaving the unarmed carrier at 600. The final assertion preserves that specific behavior and full record verification. Invalid-capability compiler fixtures include their actual factory reference so they reach the intended validation boundary.

All three original-catalog worker/HUD Chromium journeys passed together in 10.0s. The final original Rocket Trooper proof took 2.3s: a test-only unarmed-builder/APC/Rocket kit, nearby opponent spawn, fogOff and friendlyFireOff on original Training Grounds terrain isolate mounted damage at a measured distance greater than 5 and at most 6 cells. Other own armed spatial actors are explicitly outside their weapon range of the target. The APC gun has range 5; the actual rocket has range 6/forward aim/missile flight. The infantry remains private cargo, real HQ health drops, and the terminal input record verifies in Bun. The fixture stubs renderer picking and is not physical-port or transformation visual proof. Normal production starting kits are unchanged.

Core and faction fix/typecheck/test/build/content validation passed, including E2E types and actual HUD/worker proof. Normal SIM36/37 fixture goldens are 9746ecdd001b941e / eaa0d73245fde878; debug hashes are unchanged. The faction catalog validates 137 definitions/833 assets with gameplay identity 150253204c4e8317 and cosmetic identity 280dee8252ffcbb1. All six jobs passed in [CI 41513517622](https://github.com/bobalazek/open-neo-rts/actions/runs/41513517622) at 3806b5826695b36fe978d824298fe6e20e31c482. PRs #213 and #214 merged; main acaadc2ec868e9fb92512f188b6f85a324c71c91 has an identical source tree.

## Bot goal progress, SIM38

The reproduced SIM32 seed-1 army reversed course when its fixed goal timer expired before arrival. SIM38 adds a travel allowance using copied healthy-unit positions/public authored speeds, retains visible assaults while observed health falls, and prefers unexplored scouting samples. Independent review accepted the bounded correction. Focused policy/host regressions and repository fix/typecheck/test/build/content checks passed; no-bot goldens and catalog identities remain unchanged. [Decision and reproduction](./decisions/2026-11-02-provisional-bot-goal-deadlines.md).

The actual SIM38 seed-1 double trial still caps at 30,000 ticks, reproducibly at 4e76032fcf210ed8. Preserve `/tmp/neo-ai-qualification-sim38-seed1-20261102` and `/tmp/neo-ai-qualification-sim38-seed1.log`. This fixes specific goal defects, not full-match competence. Investigate its terminal state before another large batch. Next work also includes non-damage effects, transformation/disable integration and industrial/veterancy signatures; then complete persistence/replay/audio/help/content tools and later phases. All phases remain incomplete.

Continuation reproduced that exact 30,000-tick state, then naturally ended at tick 41,325, team 0, hash 8866ce860bf17bb5. The actual actors had clear fire lines and live reloads; they were still fighting, not stuck on attack movement. The persistent runner confirmed the complete seed-1 outcome twice. The three-seed, 60,000-tick-bound batch at `/tmp/neo-ai-qualification-sim38-60000-20261102` finished successfully: seed 2 tick 40,614/team 0/hash 02ce0ad66e21aa3c; seed 3 tick 29,913/team 1/hash 9b741a2e3357ac40. Every complete outcome reproduced twice. Preserve the companion log `/tmp/neo-ai-qualification-sim38-60000.log`. Two games exceed the 10–25-minute target, and this does not replace 20-game or human acceptance. PR #215 merged at e5a17126a7c7778b8de8836a3ebbd33dd90a3430 after all six jobs passed in [CI 41518625244](https://github.com/bobalazek/open-neo-rts/actions/runs/41518625244); source matches the qualified edcbbef candidate exactly.

## EMP warheads, SIM39 merged

`/tmp/neo-timed-effects`, branch `codex/timed-warhead-effects`, implements 2-15b1 without changing original content. The earlier projectile admission rejected an entire mixed damage/disable weapon; Tesla damage now applies along with its authored timed disable. [Contract](./decisions/2026-11-02-provisional-disable-warheads.md). Integration covers movement, weapons, power/production/extraction, harvesting, mechanical builder work, mode commands and cargo operations. Foot infantry is immune; deployed cargo weapons pause with their carrier. Public projected state contains a flag, not the deadline. Existing mode state, cargo identity, orders, manual power, paid progress and reload time survive.

Focused checks pass, including mixed impacts, delay/geometry/friendly fire, resistance/refresh, paused routes/work, cargo, strict wire data and replay from starting kits. Independent review found and verified closure of lost mounted attack orders and reset partial unloading work. Preserved probes `/tmp/neo-emp-order-review.ts` and `/tmp/neo-emp-dock-review.ts` now prove the original target remains assigned during EMP and 8 completed unload ticks remain intact. Repository fix/typecheck/test/build/content checks passed. All four original-catalog worker/HUD Chromium journeys passed together in 10.4 seconds, including original Tesla damage/EMP, selected status, authored expiry and terminal replay verification. Fixtures use permitted commands and test-only kits/nearby spawns/fogOff; renderer picking is stubbed. Original content and production kits are unchanged. All six jobs passed in [CI 41521727215](https://github.com/bobalazek/open-neo-rts/actions/runs/41521727215) at f6a892d2349f0cbff79bcfef0a46dab87284be17. PR #216 merged at da91304c67e8d87d880fbc3860069ae6f7f79d9c with an identical source tree.

The SIM39 20-seed double-trial batch is running from that fixed source: `/tmp/neo-ai-qualification-sim39-60000-20261102`, log `/tmp/neo-ai-qualification-sim39-60000.log`, revision companion `/tmp/neo-ai-qualification-sim39-source.txt`. Seeds 1 and 2 have completed reproducibly at ticks 41,325 and 40,614 (hashes ad10c77553032200 and e9b6b829ea3fa086). Preserve completed inputs/results and continue the existing process rather than overwrite or rerun it. These are SIM39 checks, not future SIM40 goldens or 20-game acceptance yet.

## Attached burn and beam delivery, SIM40 merged

`/tmp/neo-burn-effects`, branch `codex/burn-warheads`, implements 2-15b2a. The original Flame Tank's 5-DPS/3-second attached burn uses integer carry, bounded strongest-source refresh and actual shared damage/loss counters. Fire persists aboard; dead cargo receives no invented spatial event and cannot be revived by simultaneous emergency ejection. [Contract](./decisions/2026-11-02-provisional-burn-warheads.md). Instantaneous beam delivery uses current target poses, not ballistic lead. Public flags/HUD and strict beam events are connected; continuous flame meshes and persistent ground patches remain presentation/effect work.

Focused cases and types passed. Independent review reproduced and verified closure of a moving-target beam lead defect; `/tmp/neo-burn-beam-review.ts` now gives identical actual instant/beam contacts, damage and burn. The permanent regression covers absent/positive unused beam speed metadata. Final fix/typecheck/test/build/content checks passed, with unchanged catalog identities and no-bot goldens. All five original-catalog worker/HUD Chromium journeys passed together in 13.1 seconds, including original Flame Tank damage/burn, replacement targeting to prevent refresh, authored expiry and Bun terminal replay verification. Renderer picking remains stubbed, not visual flame proof. Bounded independent review accepted this slice. All six jobs passed in [CI 41523975284](https://github.com/bobalazek/open-neo-rts/actions/runs/41523975284) at 440adacd1d3307d95ec4c12b92a8ec47f37976a6. PR #217 merged at 0436e6a33090b68440c8a73bb34d50bb7549cf9b with an identical source tree.

## Reactor adjacency, SIM41 merged

`/tmp/neo-reactor-adjacency`, branch `codex/reactor-adjacency`, implements 2-45a from existing reactor data, without content/asset/balance edits. Integer runtime metadata preserves copied tags and power adjacency; the old debug scenario metadata expectations were updated by hand for retained tags. [Contract](./decisions/2026-11-02-provisional-power-adjacency.md). Same-Force living completed enabled sources contribute bounded additive bonuses over base power using rotated footprint edges, never boosted neighbours' output. Current off/EMP/death/ownership changes recompute links. Economic-only source handles and base/effective output are copied to snapshots/observations and the HUD.

Independent review found and verified closure of four issues: rounded low output remains valid; sparse wire source arrays reject; cached observations cannot share mutable source arrays; unfinished construction shows zero operational power without a false brownout. Probes `/tmp/neo-adjacency-wire-review.ts` and `/tmp/neo-adjacency-observation-review.ts` are preserved. Final fix/typecheck/test/build/content and all six original-catalog worker/HUD Chromium journeys passed (16.4 seconds). The original-reactor journey builds two paid sites through real builders, checks unfinished output 0 and completed totals 160/328, toggles off/on and verifies 3200 remaining credits plus a terminal replay in Bun. Test-only starting units/fogOff and stubbed renderer picking are not physical animation proof. All six jobs passed CI 41527694981 at 2edcfa215304218f7315fea88bd3e45d29686ed6. PR #218 merged at e75de9f5d9bf95bbad29a73c0682bde2d69f2355 with an identical source tree. Industrial-capacity activation and later effects/persistence remain open.

SIM39's fixed-source qualification continues: five of the first seven seeds ended naturally; seeds 6 and 7 reproducibly capped at 60,000 ticks (3b32deddbd70cb4c / 86876559065185a1). Preserve all results and keep the existing 20-seed process running. A separate exact seed-6 forensic replay is running from `/tmp/neo-ai-stall-sim39-seed6.ts` into `/tmp/neo-ai-stall-sim39-seed6` (log `/tmp/neo-ai-stall-sim39-seed6.log`). Its first assertion must match the preserved source/hash before any diagnosis; the new modifier features do not count as a bot stall fix.

## Lost-base retreat, SIM42 merged

The seed-6 forensic replay finished and exactly matched tick 60,000/hash 3b32deddbd70cb4c before saving its artifacts. Force 0 had only 11 wounded combat units, all retreating, mostly at the southwest border; its completed base and economy were gone. `baseOf` used its first moving survivor as the retreat anchor, pushing the army farther toward the corner. Force 1 still had a base and 20 nonretreating attackers. Preserve the terminal/world/movement dump and frozen SIM39 source.

`/tmp/neo-bot-retreat-base`, branch `codex/bot-retreat-base`, fixes this using copied own observations: a completed HQ then another completed own structure anchors base work; without a completed structure there is no retreat/reserve to a mobile actor, so all survivors pursue permitted goals. Wounded no-base survivors also contribute to the existing travel lease. Existing home-base retreat thresholds/hysteresis stay unchanged. [Decision](./decisions/2026-11-02-bot-retreat-base.md). Three new policy regressions failed before the fix. Focused policy/host cases (18 cases/257 assertions), independent review and fix/typecheck/test/build/content checks passed. No-bot goldens/catalog identities are unchanged. No new balance, healing, vision, injected orders/income or surrender behavior is added.

Actual SIM42 seed 6 ended naturally twice at tick 51,858/team 1/hash a86101ee1c6071cd. Preserve `/tmp/neo-ai-qualification-sim42-seed6-20261102` and its companion log/source. This exceeds the duration target and is not 20-game/human acceptance. PR #219 merged at 612ac573cb754992200f1b64e96951352c7dc370; its tree equals reviewed 95989e and rebased bfa3c9e. Hosted CI 41529960444/41531820481 could not start any steps because account payments/spending limits blocked runners. Local exact-source checks passed 16 Chromium/WebKit cases, including all goldens, six authored worker/HUD journeys and skirmish setup/retry. Firefox could not launch on this Mac (profile folder error); do not report it green. Preserve owner servers on 4320/4318; the isolated 4369 test server ended normally.

Continue non-damage effects, wreck/salvage/lifecycle presentation, required tier-1 modes/transport/industrial bonuses/veterancy and complete orders; then validated save/restore/replay, audio/help/content tools and exit evidence. Individual World/bot restore is not a complete save. Full replay files/viewer, per-type/APM/history and a real human-versus-bot completion remain open. Phase 2 and phases 3–5 are not complete.

Routes: `/`, `/settings`, `/skirmish`, `/match`, `/debug`, `/debug?terrain=1`; legacy `/?map=...` remains. CI pulls original core LFS bytes for actual identity. Never replace assets with pointers/synthetic identity bytes; incomplete installs preserve Home/debug and refuse Start.

## Industrial production engine, SIM43 merged

`/tmp/neo-industrial-surge`, branch `codex/industrial-surge-engine`, delivers 2-45b: capped rewards only after paid legal unit output; explicit Force-scoped Surge compilation; atomic current-Commander activation; canonical Force effect/cooldown surviving provider loss; exact 1500/750/0 production rates retaining work fractions. Commander-only handles/private cooldown do not reveal banks or production. Selected HUD uses the authored name/cost, cooldown and duration. [Contract](./decisions/2026-11-02-provisional-industrial-surge.md). Original catalog is intentionally inactive until the separate faction task 2-45c. No free mode-toggle cost changes.

Repository fix/typecheck/test/build/content checks pass; original catalog identities and no-bot goldens remain unchanged. Independent review reproduced and closed the boosted-brownout label error: preserve base power rate500 for status while actual work is750. The permanent regression and `/tmp/neo-surge-brownout-review.ts` both pass. Review accepted the bounded engine. PR #220 merged at ad13de2bb0fbf41520d158ef81fd4b68e30a04ca with an identical tree to reviewed 4e32441. Hosted CI remains unavailable because of account billing/spending limits.

## Authored industrial activation, SIM44 merged

`/tmp/neo-industrial-activation`, branch `codex/industrial-surge-content`,
activates the original headquarters Surge Force scope and provisional 1-IC,
cap-100 rewards on the Command Center, Barracks Complex and War Factory.
Skirmish/CLI seats receive Commander permission; the basic bot does not yet
spend capacity. Base prices, starting kits, assets, weapon values and approved
free mode costs are preserved. The raw converter accepts JSON-inferred strings
and still validates the resulting reward resource/bounds. The static debug
scenario's War Factory metadata was updated by hand.

Minimal normal fixture goldens are now 8a7d7a02533ce677/c6280e498456066f because
canonical startup identity includes the new headquarters reward metadata;
debug digests stay unchanged. The actual catalog validates 137 definitions and
833 assets: gameplay 97ddd2a140545413, cosmetic 8c190e7bcead16ad. Cosmetic
identity includes whole definition JSON.

Final fix/typecheck/test/build/content checks pass. All seven original-catalog
worker/HUD Chromium journeys passed together in 30.3 seconds. The new one
builds a paid Barracks Complex with actual builders, trains 20 original
100-credit infantry through legal exits/rally, verifies 2500 credits/20 IC,
queues two more for 2300 credits, clicks authored Surge and verifies payment
to 0 IC plus exact 1500 work. Expiry leaves 2 IC; surrender and terminal Bun
replay reproduce the final hash. No IC injection or substituted content
numbers. Test-only kits/fogOff and stubbed renderer picking remain explicit;
physical transformation/flame animations are not proved. Independent bounded
activation review accepted. Browser cooldown metadata is checked, but its
post-expiry disabled button is also unfunded; engine cases isolate cooldown
refusal. Hosted CI still cannot start because of account billing/spending
limits. Local Firefox remains unavailable because of its profile launch error.

The fixed-source SIM39 qualification is still running; through seed 13, nine
matches ended naturally and four reproducibly capped (6, 7, 10, 12). Preserve
that batch/source/log; historical SIM39 outcomes are not SIM44 acceptance.
All phases remain incomplete. Next functional work includes veterancy,
remaining effects, mode/door/wreck presentation and complete persistence/replay,
then the remaining roadmap phases. Do not restart FPS/native-key profiling or
ask routine approval questions.

PR #221 merged at 5febf7cc3802b0708e6baff2551f6bc0583fd048; its whole source
tree equals the reviewed 3187fa622190bdb6394a2dc9a19de91912aa6c58 candidate.

## Canonical veterancy, SIM45 merged

`/tmp/neo-veterancy`, branch `codex/unit-veterancy`, delivers 2-46a under the
[recorded provisional contract](./decisions/2026-11-02-provisional-veterancy.md).
Actual hostile HP damage consumes one lifetime base-health XP budget per
priced target, with exact carried fractions. The actual firing unit is distinct
from its physical platform through shots, flight, delayed impact and burns.
Three ranks add bounded health/damage, and top rank repairs after actual damage
cooldown with integer carry. Dead/transferred sources do not earn; repair and
promotion cannot refill the target's XP value. Mode damage adds at launch.
Public rank/effective HP and army-only exact XP are copied and wire-validated.
Off disables the progression and bonuses.

Independent review found and verified closure of an invented cooldown on first
XP: damage history now exists before XP and promotion leaves it unchanged.
Preserved probes `/tmp/neo-veterancy-timer-review.ts` and
`/tmp/neo-veterancy-timer-review-after.ts` show damage at tick 0, promotion at
200, then health 110→111 and carry 600 over 20 ticks. A permanent regression
matches it. Bounded engine review accepted. Repository fix/typecheck/test/build/
content checks pass, including actual launch, passenger credit, delayed shots,
burn, numeric bounds, Off, privacy/copy/wire and terminal normal input-record
replay. The original low-level XP World case was later found to skip damage;
use the SIM46 correction below for actual nonzero restore evidence. Normal fixture goldens are now
80f19002522632f2/ddb0b89a2a3b9fff for the new canonical fields/default setting;
debug digests and catalog identities stay unchanged. The extraction test's
manual restore component list includes both new components.

Player-facing 2-46b remains: setup toggle, HUD XP/chevrons, visible scene ranks
and original-catalog worker/browser proof. No final CI or full-game acceptance
is claimed. Hosted CI billing and local Firefox launch restrictions persist.

The frozen SIM39 batch has now finished all 20 double trials: 13 natural
endings and seven reproducible caps (6, 7, 10, 12, 15, 16, 18). All results are
reproducible. Preserve its source, summary and companion log; it is historical
evidence with known stalled outcomes, not the later SIM45 exit. The separate
SIM42 seed-6 repair already completed naturally twice. Do not rerun historical
batches or restart FPS/native-key profiling. Full phase 2 and phases 3–5 remain
unfinished; continue functional gameplay and remaining roadmap delivery.


PR #222 merged at 3909cef8be1c8dabd5a81d29d8106fb4cad54cb0 with an identical
source tree to reviewed c3b759dd50a2dc032060915794eae0add6bc2899.

## Refundable-site XP correction, SIM46 merged

`/tmp/neo-veterancy-credit-fix`, branch `codex/veterancy-construction-credit`,
closes a real zero-cost XP loop. The preserved independent probe
`/tmp/neo-veterancy-refund-review.ts` placed a paid 600-credit/10-material site,
dealt 10 actual HP damage at zero progress, earned 66,560 XP, then canceled for
a full refund. Repeating twice promoted the attacker with no lasting resource
cost. Unfinished ConstructionSite actors now update damage history but award
no XP. Completed structures still award bounded damage credit, and the owner’s
approved full-refund rule is unchanged.

The new permanent regression failed before the guard with XP 66,560 and now
passes two real build/damage/cancel cycles plus real builder completion and
completed-structure credit. Independent rerun of the exact exploit probe
confirmed unchanged 100→90 HP and full refund with no XP. Bounded review
accepted. The old low-level restore fixture had no vision, so allied-group
comparison skipped its damage. It now initializes real Force groups and the
site marker, asserts HP 2, nonzero XP/rank, lifetime-budget carry 2 and repair
carry 130 before serialization, loads an equally registered fresh World with
the explicit clock, then checks identical damage/repair continuation and hash.
Independent rerun passed with all preconditions. This remains a World unit
check, not a complete game-save loader.

Final repository checks pass. SIM46 and all three scenario headers align;
startup/debug fixture hashes and actual catalog identities remain unchanged
because those fixtures do not award refundable-site XP.

The accepted 2-46b UI work is preserved at 86f41140e708f830928fc3d660df9cbd3a78d581
in `/tmp/neo-veterancy-ui`, branch `codex/veterancy-presentation`, awaiting this
fix parent. It adds strict backward-compatible saved setup On/Off, HUD rank/XP
and shared unpickable scene chevrons. It passed repository checks and 18
Chromium/WebKit cases with 10 expected non-Chromium HUD skips. Its original
Soldier/Field Technician journey uses actual movement/HUD attack, a real
granted enemy-HQ shutdown to isolate XP, no health/XP/definition edits, On/Off
health/rank/XP assertions and two complete terminal Bun replays. A mobile
checkbox screenshot was inspected. Stubbed picking/test-only setup and no
physical-chevron/natural active-HQ match proof remain explicit. Rebase only
that one UI commit onto the merged correction, preserve its patch, add final
task/status documentation and verify the assembled parent before merging it.

Continue mode animation, remaining effects/lifecycle/orders and complete
persistence/replay/audio/help/content tools, then remaining roadmap phases.
All phases remain unfinished. Keep the terminal SIM39 batch and all repair
probes; no new historical reruns or FPS/native-key profiling.


PR #223 merged at 7228e9ae265a012f7ee5a0696d17dcff5f1deeef with an identical
tree to independently reviewed 20623ea65ed64838b8afcd3ad970324cefb774d2.

## Veterancy controls and presentation, SIM46

The single UI task commit rebased from 86f4114 to 2adfd80 onto the correction;
`git range-diff` confirmed its patch was unchanged. `/tmp/neo-veterancy-ui`,
branch `codex/veterancy-presentation`, now adds the final 2-46b documentation.
No additional simulation-version change is needed for these client/render
controls over the existing SIM46 On/Off rule.

Legacy seven-field saved setups migrate with their preferences intact and
veterancy On. New toggles are strict booleans; saved false reaches actual worker
normal initialization. The selected HUD shows public rank and only the exact
XP permitted by the snapshot. Scene chevrons share original code-built geometry,
are unpickable, and revoke on rank loss/fog/death/disposal. A real-GLB NullEngine
case covers shared instances, two visible Forces and final resource cleanup;
there is no physical-chevron screenshot claim. The mobile checkbox screenshot
was inspected and its save/load/launch journey passed.

Independent bounded UI review accepted source and the corrected original-unit
journey. It retains original content/prices/health/XP rules, uses actual movement
and HUD attack, and isolates the original HQ's defensive guns with a real
explicitly granted power-off command. On gives rank 3, XP 409600 and 130 HP;
Off gives no rank state and 100 HP. Both completed input records reproduce
terminal tick/hash in Bun. Test-only kits, nearby spawn, fogOff, added economic
grant and stubbed renderer picking remain explicit; no natural active-HQ match
or human acceptance is claimed. Final repository fix/typecheck/test/build/content checks over the correction
passed. The assembled Chromium/WebKit batch passed 18 cases in 38.6 seconds,
with 10 expected non-Chromium HUD skips; its eight original-catalog journeys
include both veterancy settings and terminal Bun replay verification. Hosted CI remains
unable to start steps, and local Firefox's profile launch remains unavailable.

## Vehicle deployment delivery, SIM46

Original Dragon Tank and Metamorphic APC three-second deployment assets merged
in PR #225 (`111705ee32bfa1e7e37ca64bf8ceec485df58726`) and PR #226
(`6979f3e1b1f8d109bc5004fb96b994228d85f033`). Separate fresh-context reviews
verified source/runtime equality, all original packed geometry/anchors and old
clips, real forward/reverse motion and red/blue previews. Only those definition
folders were rebuilt. Existing owner authorship follows its accepted decision.

The layered renderer in `/tmp/neo-deployment-playback`, branch
`codex/deployment-playback`, consumes public deployment state, preserves base
idle/fire, starts revealed models at their current endpoint and catches up late
imports. Independent review found and reproduced a multiple-toggle-before-import
phase loss, including paused canonical ticks 0/1/61. The correction retains
inter-toggle spans until duration is known, reconstructs saturated phase and
clears history. Both exact probes and forty independent delayed/preloaded
comparisons across both original models passed, with ten real scene passes
each; the targeted suite passes 24 cases/219 assertions. Sampled groups pause
explicitly because zero speed alone can reset their frame in Babylon.

The actual original-catalog worker/HUD deployment journey now renders both
original GLBs from its copied snapshots, inspects intermediate/deployed/repacked
poses and verifies its terminal input record in Bun. The enlarged test kit,
stubbed HUD picking, manual presentation clock, close-up camera and flat visual
ground are explicit fixtures; the worker retains Training Grounds and authored
gameplay. Screenshots under `/tmp/neo-deployment-browser-results` were inspected.
The assembled Chromium/WebKit batch passed 19 cases in 47.2 seconds with 11
expected non-Chromium skips; after the async fix the two affected rendered mode
and combat journeys passed again in 12.3 seconds. Repository/content checks pass.
Gameplay identity stays `97ddd2a140545413`; cosmetic identity is
`54a8905a7eee497b`. No SIM or balance change. Hosted CI's billing failure and
local Firefox launch failure remain open; no FPS/human/full-phase claim.

## Current bot qualification

The frozen SIM46 seed-7 pilot completed naturally twice at tick 54591, hash
`bb9af911482bf127`, winner 0. Source is clean committed
`20623ea65ed64838b8afcd3ad970324cefb774d2` in
`/tmp/neo-veterancy-credit-fix`; preserve it unchanged. Art/client-only deliveries
do not make that source the same whole tree as current main. Evidence is
`/tmp/neo-ai-qualification-sim46-seed7-20261103/summary.json`. This 45.5-minute
mirror is neither the 10–25-minute human acceptance nor twenty qualified matches.

A full twenty-seed double-trial batch runs on that same frozen source:
exec session 12497, output `/tmp/neo-ai-qualification-sim46-60000-20261103`, log
`/tmp/neo-ai-qualification-sim46-60000.log`, source companion
`/tmp/neo-ai-qualification-sim46-60000-source.txt`. Observe that existing process;
do not restart on an observation timeout or overwrite evidence. The historical
SIM39 batch remains 13 natural outcomes/seven caps and is not current acceptance.

Next: inspect the frozen bot batch's reproducible seed-12 cap, then canonical
wreck/salvage and remains presentation as separate tasks. Construction assembly
and production-door delivery are recorded below. Continue
remaining phase-2 effects/orders, full persistence/replay, audio/help/content
tools and acceptance, then phases 3–5. The overall goal remains unfinished.

## Construction stages and assembly, SIM47

PR #228 merged the stage contract at `1ea6ad9abb6061d2d906ddc3d2012cbdeebbd9e9`:
public floored integer percentages from actual quarter-work, exact work/builders
still grant-private, last-seen stages in canonical memory format 2, strict atomic
restore and copied wire/ghost adapters. Three scenario headers now use SIM47;
normal startup/short-replay hashes are `3710f12169c99149` /
`93d019b9d6ee634b`. Debug goldens and content identities stay unchanged. Independent
review checked exhaustive integer arithmetic against BigInt, hash/restore
isolation and private build grants. This remains memory-level restore, not a full save.

The renderer in `/tmp/neo-construction-presentation`, branch
`codex/construction-presentation`, reveals original structures in quarter-metre
layers with independent instance buffers and shared geometry/materials. Selectable
gold scaffold envelopes follow footprint/rotation/ground; ghosts are grey and
unpickable. Missing stage stays at zero, completion restores the full model and
removes scaffolds, and progress never advances from the render clock.

Independent review accepted production code `45cf5b2`; the subsequent change
to fixture backend reporting uses explicit `engine.isWebGPU`, plus documentation
and a folder-purpose comment. A real GPU fallback probe forced no instancing at
terrain level 2/world y=3.6: original reactor Mesh clones shared geometry/materials
but maintained distinct zero/half/completed cutoffs; cleanup left zero meshes and
materials. Evidence `/tmp/neo-independent-clone-{0,50,100}.png`.

The actual catalog/worker/HUD reactor journey now retains six observed snapshots
from two paid builds, renders the original GLB at zero/half/completion, checks
independent completed/partial instances and preserves its terminal Bun replay.
The explicit fixtures are a two-builder kit, fog off, stubbed HUD picking, manual
snapshot playback, close camera and flat renderer-only ground; worker gameplay
still uses Training Grounds and authored numbers. WebGL screenshots under
`/tmp/neo-construction-presentation-browser-results` and WebGPU screenshots under
`/tmp/neo-construction-webgpu-verified-browser-results` were inspected. The latter's
JSON report explicitly records `webgpu`; an earlier headless-shell attempt only
used WebGL and is not GPU-backend evidence. Repo fix/typecheck/test/build/content
checks pass; the assembled Chromium/WebKit batch passed 19 cases in 58.1 seconds
with 11 expected non-Chromium skips. Hosted CI and local Firefox remain unavailable.

Partial structures intentionally cast no shadow until completion. Clipped depth
passes are recorded as later visual polish (2-21b1c), after functional door/wreck
lifecycle work. No FPS or full-phase acceptance is claimed. The frozen SIM46
twenty-seed batch is still running on `20623ea` (session 12497); its results are
evidence for that older revision, not full SIM47 acceptance. Preserve that process
and its worktree/evidence; do not launch another long qualification batch for each
small feature while phase-2 canonical work is still changing.

## Actual production doors, SIM47 retained

`/tmp/neo-production-door-events`, branch `codex/production-door-events`, implements
2-21b2. Successful paid or gift output emits a bounded cosmetic producer set;
per-tick coalescing and projection reuse already published opaque actor handles.
Private queues, output types/costs and hidden/dead actors do not enter the stream.
Bots never receive it, capacity cannot change output/World/IDs/hash, and all
canonical goldens remain unchanged. SIM47 is retained; content identities remain
`97ddd2a140545413` / `54a8905a7eee497b`.

Original paired clips open, hold for one authored opening duration and close.
Repeated output preserves the current opening phase, renews holds or reverses
closing; pending imports reconstruct the observed inter-exit spans. Base activity,
deployment, preview/rest, pause and instance ownership remain separate. Ghost
doors remain closed/inert. Models without paired clips do nothing; output gains
no gameplay delay or new balance value.

Independent review accepted `1fa2b65`: 101 tests / 1,055 assertions plus four
independent cases / 54 assertions covering refusal, saturation with bot/world/hash
twins, repeated/late opening and hidden pending removal. The author batch passed
fix/typecheck/test/build/content checks and 83 focused cases / 871 assertions.
The assembled Chromium/WebKit batch passed 19 cases, with 11 expected
non-Chromium skips. A full Chromium-channel run explicitly recorded `webgpu`
and passed the actual catalog/worker/HUD production journey and terminal Bun
replay. Original Barracks opening/open/closed frames were inspected under
`/tmp/neo-production-doors-browser-results`; the GPU run/report is under
`/tmp/neo-production-doors-webgpu-*`. Its renderer-only flat ground, close camera,
filtered producer view, test-only builder kit/fog-off/stub HUD picking and manual
snapshot playback are explicit fixtures, not natural-match or FPS acceptance.
Hosted CI billing and local Firefox launch remain unavailable.

The frozen SIM46 batch remains session 12497 on clean `20623ea` in
`/tmp/neo-veterancy-credit-fix`. At the latest inspection, 14 double trials were
recorded: 13 natural outcomes, one reproducible seed-12 cap at tick 60000/hash
`db0d49c446004166`. Preserve its first replay/result and scenario before diagnosis.
It is older-revision evidence, not SIM47 acceptance. Continue observing the same
live process; do not cancel/restart it or mutate its source while investigating.

## Combat-ready bot reinforcements, SIM48

`/tmp/neo-bot-seed12-stall`, branch `codex/bot-seed12-stall`, addresses issue #231
and task 2-40c. The exact frozen seed-12 forensic replay completed at tick 60000
with the original hash `db0d49c446004166`; raw actors, bot state, observations,
movement and primitive World bytes are in `/tmp/neo-ai-stall-sim46-seed12`.
Force 1 had 26 combat survivors, 25 retreating, empty producer queues and 11600
credits. One healthy tank was still attacking, so this was reinforcement
starvation rather than evidence of an infinite match or a navigation fault.

The existing quota now counts combat-ready units and all queued combat output.
Retreat thresholds/hysteresis, authoritative prices/population/exits and all
authored content remain unchanged. An exact opaque-handle-remapped comparison
emits zero enqueues before and one original Soldier enqueue after. Permanent
regressions cover thresholds/recovery, mixed queues and actual paid legal output
through the normal bot host; the latter explicitly seeds a completed original
Barracks and 24 wounded troops to isolate the failure, not a natural match.

Repository fix/typecheck/test/build/content validation pass. An independent
fresh-context review accepted code `e4de7c22fc1439816e3f6841bced38c4163dedf2`,
ran 32 focused tests/428 assertions and separately checked the raw policy
comparison, no-completed-base fallback and budgets 1/2/64. Normal/debug goldens
remain unchanged; SIM48 and all three scenario headers identify changed bot
outcomes. Catalog identities remain `97ddd2a140545413` / `54a8905a7eee497b`.

A single-seed double trial finished on that clean committed code: exec session
65430, `/tmp/neo-ai-qualification-sim48-seed12-20261103`, log
`/tmp/neo-ai-qualification-sim48-seed12.log`, source companion
`/tmp/neo-ai-qualification-sim48-seed12-source.txt`. Both trials ended naturally
at tick 23333/hash `d1ed481e228a0254`, winner 1; full repeat verification passed
(19.44 game minutes). The terminal process exited zero.
This is not a complete current-version 20-match qualification or human exit.
Preserve that source and the completed evidence.
The separate frozen SIM46 batch remains session 12497 on clean `20623ea`;
19 results currently show 18 natural outcomes and the one seed-12 cap, all
reproducible. Preserve its existing process/source/evidence unchanged.

Next: canonical wrecks/rubble/salvage, then their projected presentation. Keep
remaining effects/orders, complete persistence/replay/audio/help/tools and later
phases active. Large wounded reserves can still consume the normal population
cap; repair/reintegration is later tuning. Hosted CI billing and local Firefox
launch remain unavailable; no FPS or full-phase acceptance is claimed.

## Canonical wrecks and rubble, SIM49

`/tmp/neo-canonical-remains`, branch `codex/canonical-remains`, delivers 2-16b1
under the [recorded provisional contract](./decisions/2026-11-03-canonical-remains.md).
Actual normal-combat death creates separate inert ECS remains, preserving source
definition, former Force and final pose. Non-foot units leave nonblocking wrecks;
structures leave rotated footprint-blocking rubble; infantry and props leave
nothing. The shared 500-remains cap evicts by oldest creation tick then ID.
Navigation/placement caches update after destruction/eviction. No resources are
awarded. Unfinished-site eligibility is retained for the subsequent salvage rule.

Copied public remains use current footprint sight and opaque handles; former
ownership grants no sight, fog revokes rows/handles, scoped actor authority is
refused, and worker packets reject malformed/private/duplicate data. Remains have
no living components, so they cannot keep a Force alive, work, fire, provide
vision/radius/power or consume living population. They are not ghost structures.

Independent fresh-context review accepted code
`637783857d309c7df8550a725374c5631b9c29fd`: 183 focused tests passed plus three
independent probes/297 assertions covering all four exact collision/sight
rotations, fog/reappearance/projection restore, equal-age ID eviction and no
resource side effects. `/tmp/neo-remains-reviewer-probe.test.ts` is preserved.
Repository fix/typecheck/test/build/content checks pass, including 505 sim cases
and all 11 Turbo test tasks. Nonzero World-only restore retains actual remains
pose/age/eligibility and identical capped continuation; this is not a full save.
The new normal component schema changes startup/short-replay goldens to
`81cb57d463df2b70` / `32292f64b5eb4f19`; debug goldens and catalog identities
`97ddd2a140545413` / `54a8905a7eee497b` stay unchanged. All three scenario
headers use SIM49.

Original-catalog evidence is `/tmp/neo-original-remains-proof` with log/script
of the same name and source companion `/tmp/neo-original-remains-proof-source.txt`.
On actual Training Grounds with unchanged kits/stats/fog, one permitted external
order moves the original enemy Supply Truck into the opposing base; actual combat
kills it at tick 6069 and emits a visible canonical wreck accepted by the worker
wire validator. Explicit surrender then ends at tick 6070; the complete input
record reproduces hash `92761ac4714bf9ec` in Bun. Bots are disabled in this fixture;
there is no state/content injection, natural full-match or rendered-wreck claim.

Next: builder clearance/salvage 2-16b2 and actual on-map remains/picking 2-21b3.
Until those connected deliveries, rubble already blocks but has no manual clear
command or persistent renderer. Wreck repair/resurrection and specialist Phoenix
Initiative behavior are later roster work. Keep all remaining phases active;
hosted CI billing and local Firefox launch remain unavailable.

## Frozen bot qualification completion and remaining cap

The original SIM46 batch (session 12497) finished all 20 double trials on clean
`20623ea`: 18 natural outcomes and two reproducible caps, seeds 12 and 20. Exit 1
correctly reports incomplete qualification. Preserve the entire output/source
under `/tmp/neo-ai-qualification-sim46-60000-20261103`. Seed 20's old terminal
hash is `dd07f349c8762049`. The separate SIM48 seed-12 quota repair already
finished naturally/reproducibly as recorded above.

The same SIM48 runtime is checking seed 20 separately: session 65169, worktree
`/tmp/neo-bot-seed12-stall` at clean `50a8f8d7991f59d22802feff1ce7d4622157295d`
(runtime equals reviewed e4de7c2; later commits are docs), directory
`/tmp/neo-ai-qualification-sim48-seed20-20261103`, log
`/tmp/neo-ai-qualification-sim48-seed20.log`, source companion
`/tmp/neo-ai-qualification-sim48-seed20-source.txt`. Both trials capped at
60000/hash `f837039a18dfb9f9`, reproducibly; the process exited 1 as expected.
Preserve the source and results. An exact forensic replay is now running on that
unchanged source: session 44053, script/log `/tmp/neo-ai-stall-sim48-seed20.ts`
and `.log`, output directory `/tmp/neo-ai-stall-sim48-seed20`. It asserts the
original tick/hash/outcome before writing actor/bot/observation/movement data and
primitive World bytes; diagnostics must not change the reproduced hash. Observe
the same process without restarting it. Inspect those raw artifacts before any
further bot repair; do not guess the cause. This is historical SIM48 evidence
while canonical remains advances to SIM49, not current full acceptance.

## Persistent remains presentation, SIM49 retained

`/tmp/neo-remains-presentation`, branch `codex/remains-presentation`, implements
the functional 2-21b3 slice. Public canonical remains resolve separate original
`presentation.wreck` URLs through the validated builtin catalog and normal session.
All 84 required original non-foot-unit/structure remains GLBs exist. Instances
share geometry/materials and preserve original neutral vertex-color debris;
live Force-color models remain separate. Final pose, rotated footprint and actual
terrain/water height drive positioning. Remains have no live clips, bars,
construction shaders or foundations. Context picking compares real distances
across live/remains layers, while army and box selection exclude remains.
Fog omission, rewind/group reset, late imports and disposal revoke roots/picking.

Runtime candidate is `ef86e7f188f2b082e0437d1b0238145f842c6865`; later edits
only clarify documentation/evidence. Repository fix/typecheck/test/build/content
validation pass. Catalog identities and all canonical goldens remain unchanged;
there is no additional simulation-version change. The assembled Chromium/WebKit
batch passed 11 cases with nine expected non-Chromium skips, covering existing
worker/HUD/replay journeys and the new remains proof. Logs are
`/tmp/neo-remains-presentation-final-*` and `/tmp/neo-remains-final-browsers.log`;
report/artifacts are `/tmp/neo-remains-browser-report.json` and
`/tmp/neo-remains-browser-results`. Chromium explicitly reports `webgpu`.

The new proof uses actual original catalog/stats/Training Grounds and explicit
fixture-only extra Tank/Reactor/Truck placement with bots disabled. Real permitted
attacks produce Reactor rubble at tick 1087 and a Supply Truck wreck at 8991;
moving the own mobile units away actually removes current sight by 9054. Only
those actual remains rows are displayed, with a close camera on original terrain.
Both original GLBs pick through their real geometry and stay out of army selection;
the no-remains sample removes both roots. This is not a normal economy or natural
full-match/replay proof. Catalog coverage is not 84 individually rendered assets.

Independent fresh-context review found no confirmed runtime blocker: 32 focused
tests, exact Chromium/WebKit reruns, a first-only single-Reactor probe with the
render loop held at three frames, plus async group/rewind/disposal probes passed.
It found a stale phase summary, now corrected. Visual acceptance remains explicitly
conditional: author parallel captures sometimes show an entirely white first-only
Reactor, followed by correct neutral colors. Independent exact and held first-only
captures have correct colors, so neither a persistent defect nor a timing cause
is established. Two readiness frames did not explain the author artifact.

Preserved contrary evidence: `/tmp/neo-remains-first-sample-artifacts` contains
both white captures and the broad report. Independent correct samples/probes are
under `/tmp/neo-remains-independent-review` (`first.png`, `held-first.png` and
the final exact WebKit results). Do not claim unconditional first-frame visual
readiness or silently discard these samples. The owner permits rough edges while
functional gameplay advances; 2-21b3a tracks this investigation after builder
clearance, and 2-21b1c remains construction-shadow polish. Hosted CI billing,
local Firefox launch and hardware FPS remain unqualified.

Next: actual builder clearance and bounded salvage (2-16b2), then the remaining
gameplay/persistence/audio/help/tools and later phases. The exact SIM48 seed-20
forensic process (44053) has now exited zero and verified `f837039a18dfb9f9`.
Raw artifacts are complete under `/tmp/neo-ai-stall-sim48-seed20`. Force 0 has
only a surviving unarmed Supply Depot; Force 1 has healthy scouts moving to an
unexplored northeast goal, no remembered enemy structures and no failed/stuck
route flags in the sampled routes. This differs from seed-12 quota starvation;
no new AI fix is included or proven. Inspect actual goal/vision/travel history
before diagnosing or changing it. Preserve both frozen worktrees and all records.

## Builder clearance and bounded salvage, SIM50

Runtime candidate `0e9f83c6e371fbf62c1bb0d97964b933cf68a284` completes 2-16b2.
Actual living builder units approach currently visible wrecks/rubble through the
existing finite exterior path policy, work using the original tool animation and
clear the row for a finite material reward. The normal HUD provides Clear / salvage
and right-click context targeting without making remains army-selectable. Private
states cross strict worker validation only with economic permission and a current
public target row. Stop/move/attack/build/repair/harvest/boarding replacement,
grant expiry, fog loss, blocked approaches and bank overflow are handled.

The [provisional rule](decisions/2026-11-03-builder-salvage.md) stores
`floor((materials + floor(credits / 100)) / 4)` from authored costs at death, zero
for unfinished/unpriced actors. One builder clears in 100 ticks; assistance uses
construction rates. Competing Forces never combine workers or double-pay; the
smallest active builder ID chooses a Force, and progress persists if it leaves.
Atomic completion keeps finished work when the bank would overflow. No credits,
salvage points, resurrection or specialist/faction bonuses are claimed.

Repository fix/typecheck/test/build/content validation pass in one final batch
(`/tmp/neo-salvage-complete-*`), including 515 simulation cases. SIM50 advances the
three scenario headers; normal startup/short replay goldens are
`85ad4a42e82c0d68` / `8898ada992a4d86e`. Catalog identities remain
`97ddd2a140545413` / `54a8905a7eee497b`, with 137 definitions and 833 assets.

Independent fresh-context review reproduced an omitted automatic construction
clearance replacement: an unselected salvager could override its blocker move
and cause a placement timeout. The missing suspension is fixed; the preserved
probe and a committed regression now permit the site while preserving wreck
work. The reviewer independently checked blocked/disabled/competing workers,
assistance and private copies, passed 63 focused tests/654 assertions and replayed
the original-content record. No remaining confirmed runtime finding was reported.

Original-content evidence `/tmp/neo-original-salvage-proof` uses unchanged original
Training Grounds kits/stats/fog with bots disabled and only explicit truck move,
salvage and surrender inputs. The truck actually dies at tick 6069; original
builders clear its wreck by 6172 for three materials; the terminal record at 6173
reproduces `63cd6478ba084a2c`. No World/content injection or natural-match/balance
claim. Script and log use the same `/tmp/neo-original-salvage-proof` stem.

The Chromium/WebKit HUD/worker journey passed both cases
(`/tmp/neo-salvage-browsers2.log`, artifacts `/tmp/neo-salvage-browser-results`):
actual original weapon death, opaque target mapping, button targeting, Stop,
right-click resumption, once-only payment and terminal replay. This fixture uses
no fog and an explicit shared enemy order grant so one worker can move the truck;
its picker is a target stub, not new graphical picking proof. The earlier
first-sample debris color limitation remains tracked by 2-21b3a. Chromium's run
preceded the unrelated automatic blocker suspension fix; the affected clearance
path was verified separately by the regression and independent reproducer.
Hosted CI billing, local Firefox launch and hardware FPS remain unqualified.

Next: remaining functional timed effects, complete orders and persistence/audio/
help/tools, then later phases. Do not rerun long AI qualification after every small
feature: the exact seed-20 diagnosis remains separate and the phase exit is open.

## First-playable combat movement and Hold position, SIM51

Runtime candidate `60fd5f393a8c2d1dbeccdf925ae5d029378d8773` delivers 2-17a:
explicit attacks now pursue current visible eligible targets, stop when range and
line of fire permit shooting and cancel the route on target loss. Minimum-range
weapons back into a legal band through bounded integer/grid candidates. Attack-move
retains its destination while pausing for in-range combat, then resumes. Failed
or completed movement does not continually resubmit a stationary destination.
Same-cell target movement can update an exhausted pursuit endpoint. No hidden
target tracking, new tactical stance or chase/leash balance numbers are added.

H/Hold position uses the normal worker/HUD path and `unit.orders`. It cancels
movement/combat/work/boarding while retaining in-range automatic fire and aiming.
Only current unit controllers see its flag. Refusals preserve it; accepted
replacement orders clear it. Mixed selections ignore structures before mutation
or grant checks. The committed regression retains friendly and hostile structure
attack locks. Bounded Shift queues, waypoint presentation and remaining context
actions remain 2-17b in tasks.md; the whole order model is not complete.

All repository batch gates pass (`/tmp/neo-orders-complete-*`), including 522
simulation cases and all 11 typecheck/test tasks; build and content validation
pass. Scenario headers advance to SIM51. Normal startup/short replay goldens are
`dca9da8e35ff7dc8` / `f336249aa74d5705`. Catalog identities remain
`97ddd2a140545413` / `54a8905a7eee497b`, 137 definitions and 833 assets.

Chromium and WebKit both pass the actual worker/HUD journey
(`/tmp/neo-orders-final-browsers.log`): pay for/build an original Industrial
Reactor with original builders, pursue/damage it using original Collective
Soldiers, issue H, retain position, retreat then attack-move and engage again.
Both terminal records reproduce tick917/hash `fa97049404edd8fb` in Bun.
Records are `/tmp/neo-combat-orders-final-results/**/combat-orders.record.json`;
author replays are logged in `/tmp/neo-orders-original-record-replay.log`.
This fixture preserves original kits/stats but uses a compact flat map, no fog,
an explicit shared enemy control grant, stub target/ground picking and explicit
surrender. It does not establish rendered picking, natural bots or the human exit.
The first browser batch timed out on an incorrect exact button label; corrected
Chromium/WebKit reruns pass. No runtime diagnosis came from that harness timeout.

Independent fresh-context review found no introduced blocker after 13 probes/60
assertions (`/tmp/neo-orders-review-probes.log`): same-cell short-range pursuit,
blocked fire lines, finite unreachable/resumed routes, repeated engagements,
rejected/duplicate Hold, EMP/grant privacy, deployed passenger fire/reload/cargo,
mixed selection and JSON terminal replay. The actual compiled Mobile EMP backs
into its original [4,14] band and selects its target; its arc projectile remains
excluded by the pre-existing projectile allowlist. This proves its movement band,
not functional original EMP firing; that unit is outside the accepted tier-1
mirror. The full later roster still needs projectile activation.

Next: complete first-playable Shift queues/context orders (2-17b), then remaining
effects/statistics and full persistence/replay/audio/help/tooling. All later phases
and the real human/20-current-version-match acceptance remain open. Preserve old
seed-20 evidence; this slice changes combat movement, not a proven seed-20 repair.
Hosted CI billing, local Firefox launch and hardware FPS remain unqualified.

## SIM52 — bounded Shift queues and context actions

Runtime/test candidate `12bd91920884df6338c92e7b321609752aa3fe35` implements
2-17b. Up to 32 pending ECS orders per unit retain issuer/grant checks; native
handlers revalidate sight, terrain, prices and targets when work starts. Accepted
ordinary replacements clear only affected actors; refusals preserve pending work.
Shared multi-builder construction starts once and pays once. Harvesting yields
after a paid unload; queued transport unloading waits until every passenger exits,
including fully blocked retries. Damaged emergency ejection clears passenger queues.
Current controllers see copied private queues, selected waypoint lines and HUD
edit/remove actions. Shift input, right-click assistance/repair and producer rally
are connected. World-marker drag/delete remains 2-17c interaction polish.

Repository boundary checks pass: fix, all 11 typecheck/test tasks (535 simulation
cases), build and content validation. Logs: `/tmp/neo-queues-final-*.log` and
`/tmp/neo-queues-docs-fix.log`. SIM52 scenario headers and normal goldens are
`c4b10b9977fd27d4` / `eafd7492b3c46470`. Catalog identities remain
`97ddd2a140545413` / `54a8905a7eee497b`, 137 definitions and 833 assets.

Chromium and WebKit pass `/tmp/neo-queues-browsers2.log`: actual HUD/worker Shift
movement, waypoint edit/delete, two sequential paid Reactors, Barracks assistance
and damage/repair, rally placement and terminal record export. Both records in
`/tmp/neo-queues-browser-results2/**/order-queues.record.json` reproduce tick 1633 /
`f2a4392776cf1376` in Bun. The fixture uses original compiled definitions/kits/stats,
a compact flat/no-fog map, bots disabled, shared enemy control, injected picking
and explicit surrender. It does not prove real rendered input, natural bot games
or the human exit. The first browser batch exposed an overly strict generic
scenario shape check for append; debug refusal now stays in the debug handler,
and the corrected connected journey passes in both browsers.

Independent fresh-context review found two issues: ignored packed-carrier attacks
could clear pending work, and partially successful unloads could drop their job
on the next fully blocked retry. Both are fixed with regressions. Six fresh raw
probes/24 assertions pass against the frozen candidate. Independent replay also
checks intermediate authoritative movement, untouched pending credits, once-only
building debits, actual repair and rally state in both browser records:
`/tmp/queue-browser-records-review.ts`. Both terminal hashes match; all 16 external
commands are accepted. The reviewer did not rerun browser rendering or hardware.

Next: 2-33 whole-match canonical save/restore, then browser persistence/replay
seeking and remaining phase-2 systems. Phase 2 and all later phases remain open;
20 current-version complete AI games and the actual human match are unqualified.
Hosted CI remains affected by the known billing block; Firefox launch and deferred
hardware FPS acceptance remain unqualified.
