# Native local replay library and viewer

Phase 2-35b connects the delivered terminal record and owned-frame playback host
to a usable local replay flow. The owner prioritized native Babylon UI and
delegated ordinary implementation choices. Keep the existing graphite panels,
original pictograms/model art and right-hand circular map.

## Library and files

Home's Single player menu opens `/replays`. A finished local match's Watch replay
action stores its terminal record and opens `/replay/:id`. The result's existing
record download remains available. The library searches names, the supported map
and recorded player labels, and offers Watch, Rename, Export, Delete and Import.
It uses the original installed Training Grounds preview, not imported image URLs.
Desktop list/detail columns stack and scroll on narrow screens.

Browser metadata lives in a separate `open-neo-rts.replays` IndexedDB database,
leaving save slots untouched. Its format-1 envelope contains an ID, name, creation
time, local setup, installed pack identities/cosmetic hash, verified winner and
the original terminal record. Export downloads that envelope. Import also accepts
the earlier bare terminal-record files and derives their local configuration.
Imported data must match the installed version and content, then reproduce the
exact terminal state in an isolated worker before anything is written. Its winner
is derived from that run rather than trusted from file metadata. Imports receive
new IDs. Rename and deletion compare the complete stored revision atomically;
stale operations preserve newer data. Damaged entries remain visible and removable.

This first viewer supports the existing Eastern Collective local mirror on
Training Grounds. Reconstruct its setup through the same `normalSkirmish` path
and compare the complete setup inside playback. Do not trust a declared gameplay
hash as permission to substitute definitions, terrain, grants or controllers.
The existing two-hour/100,000-input host limits apply; imported files are bounded
to 64 MiB. Future stored versions explain which simulation they require. Changed
installed content disables Watch. No migration is promised.

## Read-only playback

Every view owns a separate `/replay-worker.js`; it exposes initialization,
pause, speed, seeking and vision only. Command, debug, save and live-session APIs
are absent. Verification and seeking run in 20-tick batches. Cancellation, failure
or navigation terminates the candidate, rejects pending requests and ignores late
replies. Loading shows actual verification progress and has a 60-second watchdog.
Failure returns to the library without removing its record.

After terminal verification, the host grants either All vision or an existing
player seat's ordinary projection. All includes copied resources, production,
public effects/remains and a fully visible fog grid; it never grants a resolver
or publishes the World, streams, setup or keyframe bytes. Seat views preserve
their normal fog and economic permissions. The normal match worker and its
projection modes remain unchanged. Switching vision or seeking refreshes
projection/presentation ownership. Continuous playback crosses minute boundaries
by stepping, preserving kernel and handle identity instead of unnecessarily
restoring a frame. Canonical match outcomes and SIM58 remain unchanged.

The viewer presents compact native transport icons, 0.5×/1×/2×/4×/8× speed,
timeline dragging and keyboard seeking, 10-second jumps, a vision cycle, permitted
resources/unit counts and original active-production thumbnails. Space toggles
playback, J/L jump, brackets change speed, V changes vision and Escape returns to
the library. The free camera retains the match controls; the read-only circular
map pans/zooms and cannot issue orders or pings. HTML retains semantic controls
and the library's graphics fallback. Original models, team colors, work poses,
fog, hover outlines and combat presentation consume copied replay state.

## Remaining work

This is functional local playback, not the final portable replay/spectator format.
Owned one-minute keyframes are rebuilt during verification rather than serialized
into exported files. Portable validated frames, separate header map identity,
recorded camera tracks, timeline event markers, analytics overlays and delayed
network spectating remain 2-35c. Result score/territory still need actual producers.
No fake players, scores, graphs, mod compatibility or online capabilities are added.

Chromium and WebKit journeys exercise the real result→viewer→library flow, native
pointer and semantic keyboard controls, container and legacy imports, corruption,
version incompatibility, damaged-row deletion, cancellation and worker failure.
Desktop and narrow captures cover empty, populated, viewing and error states.
These checks do not qualify hardware FPS, physical touch/IME, screen readers,
real quota exhaustion or maximum-duration/memory stress.
