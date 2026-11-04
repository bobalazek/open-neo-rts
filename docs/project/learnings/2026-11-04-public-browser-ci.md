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
for stability and resource isolation. All three engine jobs still run, existing
case/job deadlines remain, and local parallelism is unchanged. The complete
hosted matrix must confirm the environment changes; other observed browser
failures remain unresolved until their actual results are checked.
