# Batched verification and seeking for local replays

Phase 2-35b needs a playback host before connecting the replay browser and Babylon
viewer. The owner delegated routine implementation choices. Reuse the terminal
input record and privately owned keyframes; do not accept arbitrary keyframe
bytes from an imported replay.

`createMatchPlayback(record, installedSetup)` owns a bounded canonical copy of
the input and compares the complete setup with the independently assembled
installed setup. A declared gameplay hash alone cannot authorize altered terrain,
definitions, grants or start settings. Like the current save loader, this first
playable path accepts at most two hours at 20 Hz and 100,000 external commands.

`prepare(maxTicks)` advances at most the requested number of ticks, regenerating
hosted bots once. Every external input must be accepted. The exact declared
terminal tick, canonical hash and an actual terminal result must reproduce before
the host becomes available. Capture a private keyframe at tick zero and every
1,200 ticks (one simulated minute), retaining at most 121 frames within the
two-hour bound. These frames are engine-owned captures, never trusted file data.

`seek(target, maxTicks)` restores the nearest captured frame when moving backward
or skipping a prefix, then advances in bounded batches. A newer destination can
supersede a pending seek. Rebuild the external command cursor at the restored
tick so a command on the frame boundary executes exactly once. Accepted input
history and pending bot decisions come from the owned frame. Kernel access is
refused while verification or seeking is incomplete. Invalid arguments preserve the
current position; an execution/restoration failure invalidates the candidate.

The caller schedules these batches in its own isolated worker and projects only
permitted display copies. The host-only `kernel` accessor is not a seat API and
must never be sent to the UI or used to mutate a running match. This module owns
no wall clock, timer, speed setting, live-match reference or command-ingest API.
The accessor is a trusted-host convention, not a sandbox: it cannot revoke a
previously returned mutable Kernel reference. Only copied projections may leave
the worker, and the host must refresh projection ownership after a seek restores
a new kernel.

This delivers the playback engine slice, not the full replay viewer. The native
browser/transport controls, playback scheduling, explicit spectator permissions,
portable metadata/keyframes and recorded camera/event views remain 2-35b work.
External save imports still verify their history. SIM58 and canonical outcome
goldens remain unchanged.
