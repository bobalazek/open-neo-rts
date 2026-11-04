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
physical speaker playback. Missing device service is a hypothesis until the
hosted startup log and affected tests establish the result.

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
reached only case 88 before its 25-minute job deadline. Split every engine into
two [file-level shards](https://playwright.dev/docs/test-sharding), retain the
individual deadlines and keep failed traces. Local parallelism is unchanged.

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
hash checks still request full saves. The test deadline and assertions remain.

The Surge tooltip failure was an actual HUD bug: the final shortcut-label pass
overwrote the authored price and deployment cooldown descriptions. Refresh those
labels first, then assign the richer descriptions; preserve their existing
cost/cooldown assertions.

These fixes do not establish a common cause for every hosted failure. The full
six-job browser matrix must qualify the final candidate before merge.
