# 2026-11-02 — Budget sequential terrain readiness explicitly

The six-map picker smoke test could exceed the default five-second `data-map`
assertion while loading resource-map art through software WebGL, or the default
30-second case deadline at its final narrow-viewport check. The same test passed
unchanged on rerun in CI runs
[41431035786](https://github.com/bobalazek/open-neo-rts/actions/runs/41431035786),
[41438427977](https://github.com/bobalazek/open-neo-rts/actions/runs/41438427977)
and [41444758547](https://github.com/bobalazek/open-neo-rts/actions/runs/41444758547).
This case now allows 15 seconds per map's readiness assertion and 120 seconds
overall for all six sequential loads and the final checks. Every map and assertion
is retained; no retries are added. These bounded correctness-test deadlines do
not measure FPS or change renderer performance acceptance.
