# 2026-11-04 — Construction and hauling work audio

**Context.** Phase-2 combat has its first original sounds and the app-owned mixer.
The visible Supply Truck harvesting/unloading states and permitted construction
orders/progress already drive presentation. Use those fields for work effects,
without adding simulation events or changing canonical state.

**Decision.** Add original Field Technician `build` and `build_complete` clips,
and Supply Truck `harvest` and `unload` clips. The mono 48 kHz Vorbis assets have
editable seeded FFmpeg filter graphs beside each unit's brick source, with the
same [rebuild command](2026-11-04-first-combat-sounds.md#rebuilding-one-clip) and
accepted owner credit. These mechanical clicks, grinding pulses and completion
tones are effects, not spoken acknowledgements or announcer lines. They remain
provisional first-pass sound direction. The [CC0 audio option](2026-11-04-cc0-audio.md)
also remains available for later clips.

Each active harvester or construction site owns a disposable sound scope. One
site gets one click sequence regardless of builder count. Build clicks require
actual projected progress and a working builder; mining requires the public
harvest operation and a non-disabled truck. Unloading follows actual dock-progress
ticks, so a stalled dock cannot continue making unloading sounds. All sources
also require current visibility. Retire scopes when work stops, stalls, becomes
hidden or changes kind/source, as well as on pause, rewind, vision change and
session disposal. This cancels decoding-pending and active voices rather than
letting stale work finish after resumption.

Provisional cadence: one build click per 12 work ticks, mining pulse per 20 match
ticks, unloading clunk per 10 dock ticks. Use current progress rather than a
catch-up loop, so skipped snapshots cannot create a burst. Construction uses
quarter-tick work, preserving cadence when additional builders speed it up.

A finishing tone requires a previously visible permitted builder/site association
and the same visible structure changing from a site into a completed building.
Deduplicate builders, and do not treat disappearance, cancellation, death,
ownership/definition change or resighting as completion. Construction details
remain subject to their existing economy permissions; this does not disclose
unavailable enemy work data or add a public construction event.

**Remaining work.** Vehicle/infantry movement loops, other roster sounds, generic
impacts, public enemy construction effects where data is available, announcer
speech/subtitles/priority queue, music and project-wide loudness validation remain
task 2-36. A finishing tone does not implement the announcer.
