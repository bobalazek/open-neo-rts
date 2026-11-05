# 2026-11-04 — Public browser CI needs its device environment qualified

Making the repository public allowed [main CI attempt 2](https://github.com/bobalazek/open-neo-rts/actions/runs/41858157832/attempts/2)
to execute again. Firefox completed with 70 passed, 8 failed and 24 existing
skips; WebKit completed with 66 passed, 12 failed and 24 existing skips. These
are failures to resolve, not permission to skip cases or weaken assertions.

Firefox had six audio failures: one analyser recorded zero signal and five
fixtures never reached audio readiness. Supply a clocked PulseAudio null output
on the runner and retain the real Babylon/WebAudio decoding, playback and
analyser assertions. The [upstream module documentation](https://wiki.freedesktop.org/www/Software/PulseAudio/Documentation/User/Modules/#module-null-sink)
describes this output backend; it does not substitute application audio or prove
physical speaker playback. The later candidate initialized `neo_ci` and passed
the affected Firefox audio journeys. This qualifies the combined audio/resource
environment correction, rather than isolating PulseAudio as the sole cause.

Two journey corrections follow observed application state. The setup Back case
must choose Leave without saving in the actual save-before-leave dialog, then
still verify the match is disposed and the setup canvas is non-focusable. Production must
wait for Resume to complete and the train button to be enabled before sending
Enter; it must still prove the exact payment, production, final totals and
replay. Both journeys passed together in Chromium and WebKit after those changes.

Use one worker per CI browser job so the headed Firefox display and software
WebGL workloads are isolated. [Playwright recommends this CI configuration](https://playwright.dev/docs/ci#workers)
for stability and resource isolation. The next candidate passed 77 Firefox cases
with only autosave rotation failing; WebKit still failed ten cases. Chromium
reached only case 88 before its 25-minute job deadline. The two-shard candidate
then passed both Firefox jobs, but Chromium's UI-heavy second half still reached
the aggregate limit. Split every engine into four
[file-level shards](https://playwright.dev/docs/test-sharding). Keep failed or
canceled traces, without trace screencasts; explicit visual-proof screenshots
remain. Local parallelism is unchanged.

Startup had a reproducible ordering bug: `data-session=ready` appeared before
the initial unpause completed, and application focus restoration happened in a
later frame after the loading modal closed. A held-unpause browser regression
failed on that early readiness marker. Keep the session internally unavailable
until unpause acknowledges; publish external readiness only after the app
removes the loading modal and restores canvas focus. Recheck disposal after the
await so cancellation cannot revive a session. Saved matches still start paused.

Autosave rotation has a different completion boundary: a cross-connection read
can observe a committed IndexedDB slot before the producer's continuation
increments its slot and releases its saving guard. Return the existing save
promise from the interval callback, and have the test await its captured
callback before starting the next interval. This keeps all three slot and
overwrite assertions without an artificial delay. Likewise, freeze assertions
must wait for acknowledged Paused state, not merely a painted menu canvas.

The local Chromium save trace then reached the later deletion checks before its
150-second case deadline, with repeated full-record reads taking 1–3 seconds
each. Metadata-only assertions now transfer only slot identity, name, kind and
date from the browser. Thumbnail, content, failed-write equality and restored
hash checks still request full saves. Hosted Chromium again reached the later
deletion checks at 150 seconds; this one long save/import/restore journey now
allows 240 seconds. All its individual data and failure assertions remain.

The Surge tooltip failure was an actual HUD bug: the final shortcut-label pass
overwrote the authored price and deployment cooldown descriptions. Refresh those
labels first, then assign the richer descriptions; preserve their existing
cost/cooldown assertions.

Hosted WebKit diagnostics distinguish actual delay from missing completion:
the snapshot export acknowledged, simulation updates continued, and a read
transaction eventually completed after about seven seconds. A later explicit
commit experiment still took about six seconds from the test's open request to
completion; request success and transaction completion arrived together. Do not
ship an autocommit workaround from this evidence. Headed mode also failed, so
keep WebKit's existing headless mode.

The CI-only default assertion budget is now 15 seconds rather than five, after
observed database event delivery exceeded five seconds; other worker/UI failures
still need qualification. Explicit readiness and per-case budgets retain their
own limits. Local defaults stay unchanged. This
does not qualify physical input latency, FPS or audio. The guidance journey
pauses the actual simulation while inspecting help and dismissal, so its
400-tick hint cannot expire during slow remote-control round trips.

These fixes do not establish a common cause for every hosted failure. The owner
subsequently [narrowed qualification to current Chrome and WebKit](../decisions/2026-11-04-browser-support-scope.md).
The four-shard/Firefox work above is historical evidence, not the current CI
configuration. The two standard full-suite browser jobs must qualify the final
candidate before merge; Linux WPE failures are not presented as repaired.

The first macOS WebKit run, 41883902689, completed 76 journeys with 24 skips
and two failures. Its text-selection trace shows Enter sent to Save while the
menu still said Pausing; wait for Paused and an enabled Save button. The salvage
trace expires inside its bounded death-step loop, before the work assertions,
and cleanup masks that original location. Keep all tick bounds and assertions
and allow this full worker/HUD/replay integration case 240 seconds. A longer
deadline requires a complete passing rerun before qualification.

The later Linux Chrome run [41930066905](https://github.com/bobalazek/open-neo-rts/actions/runs/41930066905)
timed out waiting for the cloned definition to appear while its original fields
remained disabled. This proves an incomplete operation at the deadline, not a
wrongly committed clone. Previous runs also stalled in screenshot and page
evaluation calls; do not infer one application bug from these different waits.
Chrome now uses the same standard macOS runner as WebKit, removing the Linux
Xvfb/Mesa/PulseAudio setup. This is a smaller qualification environment, not a
repair claim for Linux. It retains both complete suites and all their assertions;
a complete hosted run is required for qualification. Playwright supports the real
[Chrome stable channel](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge),
and GitHub supplies [standard macOS runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#standard-github-hosted-runners-for-public-repositories).

The macOS candidate WebKit run 41934141324 passed 88 journeys, with only the
initial autosave read failing. Its trace starts a read before the first save
commits: that read returns an empty snapshot after ten seconds, and the next
read is still pending when the 15-second polling window closes. The final page
already reports a committed save. Wait for that existing commit notice before
opening the independent test read; retain the saved-slot, rotation, failed-write
and restoration assertions and all existing deadlines.

The local current-Chrome save journey also produced a real one-colour thumbnail.
The old code called `scene.render()` and immediately copied the canvas, before
WebGPU's end-of-frame submission. The renderer now waits for scene readiness and
uses Babylon's [completed-frame screenshot API](https://doc.babylonjs.com/features/featuresDeepDive/scene/renderToPNG/).
Disposing the renderer rejects a pending capture; persistence rechecks session
disposal before writing the image and snapshot. Keep the existing varied-pixel
thumbnail assertion, rather than accepting an empty image. Save capture no longer
manually renders between ordinary frames or changes backbuffer preservation.

The same Chrome batch completed all 113 cases (101 passed, 12 failed). Several
keyboard journeys sent Enter while the menu or exit prompt was still disabling
its actions for a pause acknowledgement. Waiting for a dialog to exist, or for
the worker's Paused projection, does not prove those actions are enabled. Wait
for the intended button's enabled state before pressing it; after the top-level
Pause action, wait for its Resume state before asking to leave. The model-tools
End-key check also waits for the resized table to draw before scrolling it.

One failure was an actual native-input bug: clicking an empty field left a
Babylon pointer coordinate awaiting the next draw. Typing before that draw gave
the stale coordinate a new string to reposition, moving subsequent characters
into the middle. An empty field has only one valid caret position; clear that
pending coordinate before processing its first key. Existing nonempty pointer
editing and semantic Unicode-selection behavior stay in place.

The final restart/cancel probe exposed a real action-state gap. Closing the
confirmation returns browser focus before the controller finishes its awaited
pause restoration. The parent Restart action looked enabled but its activation
was discarded by the still-owned exit transaction. Parent menu actions now stay
disabled, and the action runner stays guarded, until that transaction finishes;
the existing cancel path still restores pause, controls and focus. A held worker
acknowledgement proves the disabled interval before permitting a second restart.

An independent browser-Back probe found that gating the main menu alone did not
cover an idle Load gallery. Cancel now leaves its existing decision modal busy
and open until the owner finishes restoration and disposes it. This keeps every
underlying pane blocked by the same modal, including when no gallery-owned action
is running. Held acknowledgements cover both main-menu restart and browser-Back
from the idle gallery, preserving the selected save and paused tick.

The [replay-event candidate](https://github.com/bobalazek/open-neo-rts/actions/runs/41947902217)
later finished Chrome with 112 passed and two timing failures. The HUD trace read
paint coordinates 1.24 ms after the semantic selection assertion completed; a held real
animation frame reproduced valid DOM details with no native text yet. Wait for
the existing `nativeTextPoint` observations before reading layout, retaining the
same playable-area and economy-order assertions. The menu trace resolved the
second Surrender target as disabled after dismissing its first confirmation, so
Enter produced no second confirmation. A held outgoing pause-restoration request
reproduced this interval; waiting for enabled Surrender before the next Enter
reached the real Defeat result. These are causal harness waits, not longer sleeps,
weaker assertions or changes to gameplay/menu behavior.

The [analytics candidate](https://github.com/bobalazek/open-neo-rts/actions/runs/41954242486)
passed all 114 Chrome journeys and repository verification. WebKit passed 89,
skipped the existing 24 and failed its first native Resume click. The trace still
showed Pausing and disabled Resume when the pointer click started; the menu later
reached Paused, after that click had correctly been ignored. A menu's `data-panel`
and painted label establish presentation, not completion of its worker pause.
Wait for enabled Resume before the desktop and narrow pointer checks; retain
the actual native click, menu dismissal and advancing-tick assertions.
