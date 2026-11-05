# Replay event navigation

Scope: `src/features/replays/viewer.ts`, the native replay HUD and its verified
worker annotations. Operate mode for players finding combat and Force outcomes
in a finished replay. This is a code-led extension of Graphite Command Stations,
inheriting `PRODUCT.md`, `DESIGN.md` and the emitted body contract in
`../../apps/web/index.html`; no replacement identity or raster is needed.

The battlefield remains dominant. The existing graphite transport keeps its
clock, range and playback controls. A compact icon row directly below the range
marks verified damage intervals and public Force outcomes; previous/next event
icons sit beside the clock. Preserve the right circular minimap and upper player
observations at desktop and narrow widths. Hover/focus supplies event time and
details without permanent explanatory text.

The signature interaction is a marker click that seeks to its actual tick and,
for combat, pans to its permitted damage location. Dense intervals share a
pointer target and cycle members on repeated clicks. Comma/period and semantic
previous/next buttons provide keyboard navigation to distinct event ticks.
Annotations follow All or the selected seat's event visibility. Seeking cannot
append history or change sim state. Existing import/export, playback, focus,
vision and camera controls remain functional.

Provisional grouping is one positive-damage marker per ten-second interval per
view, with exact Force outcome ticks. It does not classify individual battles.
The native row and adjacent-event icons disappear when that view has no events.
Named buttons remain in the semantic ordered event list with `tabindex="-1"`;
previous/next provides sequential keyboard access. Semantic marker focus mirrors
an ivory two-pixel cluster frame and event help; hover uses a thin warm frame.
Previous/next disables without a strictly adjacent event or while seeking;
markers disable while seeking. Native disabled controls dim to 0.45 opacity and
suppress activation. Native transport actions return focus to the battlefield
canvas; comma/period preserve ordinary editing when an input, select or button
owns focus. Ordinary worker updates preserve marker help and cycling position;
changed marker identity resets cycling and restores focused-control help.

Post-review documentation follows the actual desktop/narrow Chrome and WebKit
captures opened for the scoped finish review:

- `../review/replay-event-desktop.png`
- `../review/replay-event-mobile.png`
- `../review/replay-event-webkit-desktop.png`
- `../review/replay-event-webkit-mobile.png`

Focused real-browser journeys passed actual surrender-marker pointer activation,
Period navigation and replay library import/export/seek flows in Chrome and
WebKit, including the final journeys after the hover correction. Independent
technical probes cover event visibility and temporary grant expiry, literal lethal
combat and elimination, unchanged simulation hashes and painted synthetic-cluster
cycling. The repository fix, typecheck, test and build batch passed again, covering
all 11 package tasks. Combat camera panning was source-traced through the
established minimap route; an end-to-end combat pan was not exercised.
An independent hover correction recheck passed preservation on unchanged
history, invalidation on changed/cleared history, new-label hover and repeated
real-pointer cluster cycling. The final scoped finish review resolved its single
documentation correction and returned a ship disposition for this extension.
The four refreshed actual Chrome/WebKit captures remained valid, with no visual
regression apparent from the hover correction. This is a bounded replay-event
verdict, not whole-project approval.

These are bounded checks, not a claim that the full browser-hosted candidate
suite is green. Physical touch, physical IME, screen-reader user testing and
maximum-size replay stress remain unqualified. Verified portable frames and
explicit map identity and recorded cameras are built; delayed
spectating remain separate work, and the replay/spectator phase is not complete.
The inherited world needs no new visual identity, raster, composition or quality
bar. The existing `force-opponent` palette advisory remains advisory, not a
palette expansion.

## Optional replay statistics extension

The analytics slice extends this same Operate surface and Graphite Command
Stations. G and the original native graph pictogram toggle a nonmodal pane below
player observations; battlefield, transport and circular minimap remain usable.
Four equal framed tabs reuse graphite fields, warm-metal selected wells, compact
Arial and ivory synchronized focus. No new identity, composition, palette, type
system or assets accompany the extension.

Economy and Military draw permitted resource/inventory history directly through
Babylon GUI Canvas, with Force legends, alternating line patterns and complete
semantic sampled-value tables. Metric choices reuse semantic selects and native
controls. Shared post-match income math excludes opening stock and refunds;
army values retain authored recruitment costs separately by resource. Production
groups original queued-unit thumbnails by producer, wraps them to available
width, draws real progress and supplies name, work state and percentage through
contextual help. All queues remain reachable through pointer and keyboard
scrolling. Orders presents accepted-order APM first, then secondary totals and
active time, with human and bot controllers identified separately. Selection,
camera and refused inputs do not inflate APM.

Semantic tabs, metric selects and table/queue regions own keyboard behavior and
mirror focus into native controls. Tabs retain their arrow-key navigation;
scrolling regions support arrows, Page Up/Down and Home/End. Loading and empty
states reflect actual data. Closing opts out of detail publication; seeking or
changing vision clears stale analysis until the new permitted position arrives.
Only a verified settled terminal-replay host supplies opted-in statistics, using
the existing per-seat inspection permissions. The ordinary live-seat final-only
detail gate, canonical sample history, simulation hashes and simulation version
remain unchanged. See
`../../../../docs/project/decisions/2026-11-05-replay-analytics.md`.

Final browser presentation evidence is scoped to current stable Google Chrome
and current Playwright WebKit at desktop and narrow widths. The corrected-font four-case rerun passed
all four replay/paid-production journeys in
`/tmp/neo-analytics-corrected-browser.log`. Its twelve actual captures cover Economy
at desktop/narrow widths, Orders desktop, Production desktop/narrow and paid stock
narrow in both browsers, preserved beside this brief:

- `../review/analytics-economy-desktop-{chromium,webkit}.png`
- `../review/analytics-economy-mobile-{chromium,webkit}.png`
- `../review/analytics-orders-desktop-{chromium,webkit}.png`
- `../review/replay-production-desktop-{chromium,webkit}.png`
- `../review/replay-production-mobile-{chromium,webkit}.png`
- `../review/replay-paid-stock-mobile-{chromium,webkit}.png`

The documenter opened corrected Chrome narrow Economy and WebKit desktop
Production captures; labels, producer title and contextual help use readable
compact type. Independent cached-font and Canvas-text probes across
1440→390→1440 resizing also passed in both browsers. Earlier passing captures
with cached font sizing are superseded and do not establish the recorded type
ramp. The scoped finish verdict resolved typography and documentation, reopening
all twelve corrected captures with no visible regression from that batch. No palette
detector rerun was performed; the inherited `force-opponent` advisory remains
advisory.
Delayed live spectating, full replay/spectator phase acceptance,
physical touch/IME, screen-reader user testing, maximum-size replay
stress and hardware FPS remain open.

## Recorded camera extension

This code-led Operate extension retains the same world, compact header and
contextual help. An original camera pictogram beside vision and exit cycles free
or recorded-player camera with C, with a warm selected well while following.
Semantic camera choices mirror focus and preserve vision independently. Manual
navigation returns to free mode; seeking restores the recorded pose. Only actual
human recordings are offered. Camera-free files keep a dimmed control with
contextual explanation. A resumed recording is unavailable before its first tick.
The current window's aspect ratio adapts the recorded view. No new identity,
tokens, raster, quality board or replacement comp accompanies the extension.

Behavior and metadata limits follow
`../../../../docs/project/decisions/2026-11-05-recorded-replay-cameras.md`.
Capture records target, rotation, pitch and distance against observed simulation
ticks, replacing the same tick's pose after paused edits. Initial capture precedes
unpause; terminal capture freezes before result-screen camera movement. Loaded
matches record only their resumed segment, and draft playtests record no camera.
Playback directly seeks and interpolates poses, including shortest-angle wrap;
pause holds the current tick. Keyboard/edge/drag pan, rotation, wheel zoom,
minimap navigation and combat-event pans all return to free mode.

Optional `cameras` metadata survives both envelope formats: actual normal result
downloads retain the format-1 worker record, while library portable upgrades add
verified format-2 frames/map identity and preserve cameras through rename,
export and import. Strict fields, finite bounded poses, unique recorded seats,
monotonic ticks within duration and an aggregate 144,001-sample limit apply before
storage/watch, alongside the existing two-hour and 64 MiB file limits. Imported
camera annotations remain untrusted presentation metadata; simulation-history
verification does not authenticate them. They never change commands, canonical
state, keyframes, hashes or simulation version.

The initial four-case real-browser attempt exposed dropped format-1 metadata and
is superseded by the corrected four passing replay/paid-production journeys in
`/tmp/neo-camera-browser-confirm.log`: Chrome 22.4s/17.4s and WebKit 29.0s/22.3s.
They exercise native pointer/C/semantic-select follow, rewind, manual pan override,
rotated/zoomed recording data, portable import/export and camera-free legacy
playback. The actual normal format-1 download was also inspected. Fresh focused
parser checks passed seven tests/60 assertions; independent technical probes
passed seven probes/60 assertions. The full repository fix, typecheck, test and
build batch passed.

The fresh scoped finish review returned SHIP without a material correction and
independently opened all eight valid actual captures:

- `../review/camera-follow-desktop-{chromium,webkit}.png`
- `../review/camera-follow-mobile-{chromium,webkit}.png`
- `../review/camera-free-desktop-{chromium,webkit}.png`
- `../review/camera-missing-desktop-{chromium,webkit}.png`

Evidence is limited to current stable Google Chrome and current Playwright WebKit.
Loaded-match camera segments and post-result pose freezing were source-reviewed,
not independently exercised in a browser. Maximum-size replay stress,
hardware FPS, physical touch/IME and screen-reader user testing remain unqualified;
delayed live spectating and full replay/spectator acceptance remain open. The
detector ran once at `/tmp/neo-camera-design-detect.json`; its existing `#efa394`
advisory remains advisory, with no rerun or palette expansion. No new identity,
raster, quality board or replacement composition was introduced.
