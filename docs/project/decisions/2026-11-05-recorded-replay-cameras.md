# Recorded player cameras

Date: 2026-11-05. Phase: 2-35c, local camera slice.

## Decision

Record the actual local human camera and let the replay viewer follow it or use
free navigation. Camera and vision remain separate choices: following a camera
does not change fog/economic permissions. This follows the separate Player Camera
and Player Perspective controls in Blizzard's
[StarCraft II replay guide](https://news.blizzard.com/en-us/article/424210/press-the-replay-button).
The game's existing replay design already calls for both modes.

The native camera pictogram shares the compact top control group with vision and
exit. Its warm selected well identifies following; hover/focus names the current
mode and C shortcut. The semantic select lists Free camera and only seats with a
recording. C and the native pictogram cycle available choices. Keyboard, edge or
drag panning, rotation, wheel zoom, minimap navigation and combat event navigation
return to free camera. Existing graphite material, icons, keyboard focus,
transport and circular map remain authoritative.

## Recording and playback

Capture target, rotation, pitch and distance once per observed simulation tick,
retaining the latest painted pose when a paused tick receives camera edits. The
initial camera is captured before unpausing and the final pose freezes at the
terminal update. Bots have no invented camera. Draft playtests do not record one.
A loaded match records only from its actual resumed tick; earlier camera choices
are unavailable, and seeking before a track starts returns to free camera.

Playback seeks directly by binary search and interpolates neighbouring poses,
using the shortest rotation across angle wrap. Paused playback stays at its tick.
Viewports use the current window's aspect ratio; this is camera movement playback,
not a recording of the player's pixels or cursor. Manual navigation remains
available immediately after leaving follow mode.

Replay envelopes gain an optional `cameras` field in either record format, bound to recorded seat
IDs and terminal duration. Strict field, finite number, coordinate, angle, distance,
monotonic tick, unique seat and aggregate 144,001-sample checks apply before
storage/watch. Existing two-hour and 64 MiB limits still apply. Camera annotations
are untrusted presentation metadata; history verification does not authenticate
them. They never enter commands, canonical state, keyframes or hashes, so neither
simulation outcomes nor the simulation version change.

Normal result downloads now use the metadata envelope, retaining camera tracks
alongside the existing format-1 worker record. Library exports add verified
portable frames and preserve cameras through rename, export and import.
The headless verifier already accepts envelopes and continues
to verify their embedded simulation history. Camera-free portable files and raw
legacy records retain free-camera playback. Raw worker/debug reproduction exports
keep their existing simulation-only purpose.

Delayed live spectating belongs with the online systems. This does not complete
phase 2 or any later roadmap acceptance.
