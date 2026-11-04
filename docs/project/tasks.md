# Tasks

Work that can start now without a further decision, grouped by [roadmap](./roadmap.md) phase. Default to one substantial task per pull request; small related tasks may share a PR. The types shown guide its primary type and required checks ([pull-requests.md](../contributing/pull-requests.md)). Dependencies, scope and acceptance criteria live in the [phase plans](./phases/README.md); work blocked on a person goes in [human-tasks.md](./human-tasks.md).

## Phase 1a: delivery status

The [phase-1a exit](./phases/1a.md#exit-criteria) is met: PR #46 passed Bun and Chromium, Firefox and WebKit [in CI](https://github.com/bobalazek/open-neo-rts/actions/runs/41341002715) and merged at `6519ae8`. The [benchmark](./phases/1a.md#1a-13--add-bun-neo-bench-for-tick-cost) and [divergence traces](./phases/1a.md#1a-12--report-the-first-divergent-tick) are also done on main through PR #47 (`f710103`) and PR #48 (`d0fd2ca`); do not reimplement them.

## Now: phase 2 (functional gameplay)

The owner [authorized gameplay before performance acceptance](./decisions/2026-11-02-gameplay-before-performance.md) and [delegated provisional implementation choices](./decisions/2026-11-02-provisional-implementation-autonomy.md). Phase 1b remains unfinished; its FPS/native-key work is deferred. Choose coherent defaults, record them and keep building; human tasks are later tuning/review work rather than repeated approval stops.

The owner now prioritizes the UI pass. Home uses [native Babylon GUI](./decisions/2026-11-03-native-menu.md), an original vector wordmark and an authored model display. [Skirmish setup](./decisions/2026-11-03-native-skirmish-setup.md) now uses native fields/actions and the authored map preview while preserving its validator and shared normal match path. Continue through the remaining game screens with keyboard/assistive access intact.

[Settings and pause panels](./decisions/2026-11-03-native-settings-and-pause.md) now
share native presentation while retaining their real preference and modal
controllers. [Save galleries and results](./decisions/2026-11-03-native-load-and-results.md)
also use native thumbnails, tables and history views. The
[battlefield station](./decisions/2026-11-03-native-battlefield-station.md) now uses
native contextual controls and a right-hand circular minimap. [Loading and
failure feedback](./decisions/2026-11-03-native-loading.md) now use the same native
panel with actual stage progress, cancellation and retry. Debug conversion remains UI work.

The [region pass](./decisions/2026-11-03-battlefield-regions.md) follows the owner's
AoE IV reference: economy beside selection, explicit owner/type identity, compact
global controls and no empty selection panel.

The [world-feedback pass](./decisions/2026-11-03-world-interaction-feedback.md)
adds visible actor/resource hover silhouettes, selected ore-target feedback and
original Supply Truck harvesting/unloading animation from actual projected work.

Native text inputs now mirror semantic caret and selection in setup, named saves
and both save galleries, while retaining native pointer editing and HTML keyboard
and clipboard ownership. The [selection adapter](./learnings/2026-11-03-native-selection-indices.md)
isolates the pinned Babylon range representation.

[Model inspection](./decisions/2026-11-04-model-inspection-tools.md) now provides
native installed/local model controls and shared validation at `/tools/content`.
[Browser definition authoring](./decisions/2026-11-04-browser-definition-authoring.md)
now adds schema-derived edits, guarded existing-file writes/downloads and disk
conflict review. [Template creation](./decisions/2026-11-04-definition-creation.md)
adds guarded multi-file saves and ZIP changes downloads. Full asset/formatter
parity, draft playtests and asset editing remain below; the whole editor task is still open.

The [SIM59 qualification](./learnings/2026-11-04-sim59-complete-matches.md)
completed all twenty seeded bot mirrors twice without a crash, cap or divergence.
The real human match, duration, roster-use and other phase-2 exit clauses remain
open; most AI mirrors exceeded 25 simulated minutes.

- [ ] [2-38b2 · Full save-validation and formatter parity](./phases/2.md#2-38--content-tools-and-playtest-slice). PR type: engine/tooling; shared export/provenance metadata and GLB conformance checks are implemented in 2-38b2a. Finish runtime audio validation, source/schema freshness and exact project formatting before closing the whole definition-editing task.
- [ ] [2-38d · Asset editing](./phases/2.md#2-38--content-tools-and-playtest-slice). PR type: engine; part/socket gizmos, safe GLB socket export and remaining editor tabs.
- [ ] [2-21b1c · Clipped construction depth passes](./phases/2.md#2-21--present-combat-and-construction-events). PR type: engine; later visual polish after functional lifecycle work, replacing the current no-shadow policy for partial structures.
- [ ] [2-21b3a · Diagnose intermittent first-sample debris colors](./phases/2.md#2-21--present-combat-and-construction-events). PR type: engine or tooling after diagnosis; parallel browser captures sometimes show white initial debris, while later and independent first-only captures have correct colors. Preserve contrary evidence; polish after builder clearance.
- [ ] [2-31b · Remaining input settings](./phases/2.md#2-31--in-game-pausemenu-and-device-settings). PR type: engine; native save-before-replacement, current-match keyboard profiles, audio mixer/preferences and [mouse camera sensitivity/inversion](./decisions/2026-11-04-mouse-camera-settings.md) are implemented. Add overlay or new action settings with their actual systems.
- [ ] [2-36 · Audio library and remaining routing](./phases/2.md#2-36--first-playable-audio-and-original-assets). PR type: engine/art; the app-owned Babylon mixer, native preview/save/cancel levels, interface/test cue, [all six armed first-playable signatures](./decisions/2026-11-04-first-playable-combat-library.md), [construction/hauling work cues](./decisions/2026-11-04-construction-and-hauling-audio.md), [visible public construction effects](./decisions/2026-11-04-public-construction-effects.md), [first-playable movement loops](./decisions/2026-11-04-first-playable-movement-audio.md) and [runtime clip validation](./decisions/2026-11-04-runtime-audio-validation.md) are implemented. Add other-roster movement/noncombat/generic impact clips, music, announcer speech/subtitles/queue, playlist/ducking and full-mix/category loudness qualification. [Verified CC0 audio](./decisions/2026-11-04-cc0-audio.md) is also approved.
- [ ] [2-32b2 · Remaining result views](./phases/2.md#2-32--post-match-results-replay-and-restart). PR type: engine; summary/per-type/history/controller results, record download and Watch replay are implemented. Territory and score require their actual rules/producers.
- [ ] [2-35c · Portable replay frames and remaining viewer features](./phases/2.md#2-35--replay-recording-keyframes-and-viewer). PR type: engine; the [native local library/viewer](./decisions/2026-11-03-native-replay-viewer.md) now provides verified metadata/import/export, read-only playback, owned-frame seeking and All/player vision. Add independently validated portable keyframes/full header, recorded cameras, event markers/analytics and later delayed spectating.

The connected normal skirmish now includes actual economy/build/production, hauling/extraction, vision/fog, combat/projectiles/death, the hosted opposing bot, HUD/minimap and canonical victory/surrender with result/rematch navigation. SIM37 adds authored Bunker passenger weapons with retained reload and private cargo state after boarding/unloading/ejection and Siege/Bunker mode modifiers. All 137 authored definitions compile. Full phase-2 acceptance, remaining roster signatures, save/replay/menu/audio and later phases remain work; a single complete AI-vs-AI trial is not the full exit.

## Deferred phase-1b acceptance

- [ ] [1B-39 · Browser key-capture evidence](./phases/1b.md#1b-39--check-browser-key-capture). PR type: tooling.
- [ ] [1B-58 · Close the measured renderer frame-budget miss](./phases/1b.md#1b-58--close-the-qualified-renderer-frame-budget-miss). PR type: engine after profiling; issue #167.

[1B-51 · Counted start-anchor preparation](./phases/1b.md#1b-51--bound-continuous-start-anchor-fallback-work) merged in PR #157. Its CI benchmark failure exposed repeated singleton admission work, corrected by [1B-54](./phases/1b.md#1b-54--avoid-repeated-singleton-queue-admission-work) with unchanged SIM8 state, benchmark and watchdog. This correction and the [affine shadow fit](./phases/1b.md#1b-53--project-dynamic-shadow-bounds-by-affine-half-axes) passed assembled repository checks and all six jobs in [CI 41375970207](https://github.com/bobalazek/open-neo-rts/actions/runs/41375970207) at main `330584c`.
## Delivered foundations

All existing 54 units, 46 structures (including the shared Resource Extractor) and 37 props have first-pass model references. Remaining Alliance of Free Nations artwork merged in PR #70–89 and Phoenix Initiative artwork in PR #90–112, one definition folder per art PR. Strict animation/team-color validation follows the integrated art. Final art direction remains an owner decision.

The map-aware worker/debug client includes authoritative placement, terrain navigation, reachability, shared path budgets, movement and occupancy repathing; model instances, team colors and idle/move playback; inspector/time controls, selection/box selection and distinct move/stop/attack-move commands. Graphics presets, structure foundations and animated water/shore foam complete the current renderer delivery batch. Assembled main `11e7694` passed repository/content/three-browser [CI 41366189139](https://github.com/bobalazek/open-neo-rts/actions/runs/41366189139); measured performance and the remaining phase-exit clauses stay open.

The [water-domain table](./decisions/2026-11-01-movement-water-table.md), [debug placement exception](./decisions/2026-11-01-debug-spawn-placement.md), [neutral extractor policy](./decisions/2026-11-01-neutral-extractor.md), [extractor economy](./decisions/2026-11-02-extractor-economy.md), [ground targeting](./decisions/2026-11-02-ground-targets-structures.md) and [normal construction rules](./decisions/2026-11-02-normal-construction.md) are accepted. Missing paid headquarters recipes remain unavailable. Full fog, combat and ore logistics remain phase 2. The [phase-1b exit](./roadmap.md#exit-criteria), including measured 200-unit medium frame rate, is still open.
