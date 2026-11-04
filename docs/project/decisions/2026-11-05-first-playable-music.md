# First-playable music and playlists

Phase-2 task 2-36 now has original menu and in-match music on the existing
app-owned Babylon mixer. This is a playlist/music slice; announcer speech,
subtitles and the notification priority queue remain unfinished.

## Playback

Menus use Command Board. A committed normal match or temporary draft skirmish
uses Assembly Line and Steel March. In-match tracks use a presentation-side
shuffle bag, with every available track visited before refill and no adjacent
repeat when another track is available. This follows the separation in
[OpenRA's music playlist](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/World/MusicPlaylist.cs):
cosmetic shuffle and completion callbacks stay outside simulation randomness.
No source code or music is copied from OpenRA.

This is a fixed built-in soundtrack, imported through the existing asset file
loader. It does not introduce a pack-configurable music format or change the
definition catalog's cosmetic identity; music authoring/recording stays future
work. Export provenance and runtime audio validation still cover every track.

The desired playlist waits for browser activation. Menu navigation preserves a
playing track; only a committed match changes context, so a canceled/failed load
does not replace the prior session's music. Leaving a match returns to menu music.
Draft restarts retain the preview mixer and playlist; returning to the editor
disposes them. Replay playback remains silent in this slice, while its library
uses menu music. Debug and model inspection do not start a soundtrack.

Music follows saved/live Music and Master levels, global mute and the existing
focus-mute rule. Muting stops playback; re-enabling starts a new track from its
beginning. Context changes and disposal revoke pending decodes and obsolete end
callbacks. Decode failures skip each failed track once per context, then stop
if none can play; they never spin, block navigation or queue stale playback.
The current playlist uses one protected priority-2 voice inside the existing
32-voice cap, rather than allowing ordinary weapon effects to cut off the bed.

Actual active announcer-bus audio temporarily multiplies the selected music
level by a provisional 0.35. Ending, stopping, muting or disposing the announcer
restores the user's current level. Babylon's existing parameter ramp smooths
gain changes. This includes the announcer test cue; it does not implement spoken
gameplay announcements. Layered combat crossfades and win/loss stings remain later
music work.

## Original assets and evidence

`content/core/music/` contains three stereo 48 kHz Vorbis exports and their
editable original score/synthesizer. Each render command writes one track; no
external samples, recordings or generative audio model are used. Agent-directed
credit follows the accepted owner-authorship decision. The source record
discloses the coding agent's role; music direction remains provisional.

Full encoded-file FFmpeg decoding and EBU R128 measurement produced:

| Track         | Duration | Integrated | True peak  |
| ------------- | -------- | ---------- | ---------- |
| Command Board | 48 s     | −24.0 LUFS | −14.2 dBTP |
| Assembly Line | 48 s     | −24.0 LUFS | −11.1 dBTP |
| Steel March   | 40 s     | −24.0 LUFS | −10.8 dBTP |

The CLI retains full container/codec/peak checks and now requires stereo exports
in music folders. Music imports use the existing file loader, and binaries use
Git LFS. No dependency, gameplay data, SIM59 state or outcome golden changes.

Unit checks cover activation, shuffle completion, stale callbacks, mute,
disposal and bounded failures. Current Chrome and WebKit checks cover actual
track decode/output, native music preview/save, menu/match/return ownership,
announcer completion/cancel ducking and the existing combat/work scopes. Gain
assertions wait for Babylon's actual ramp; reading a new target synchronously
would measure the prior gain. Per-track meters do not qualify full gameplay-mix
loudness, perceptual listening or final faction music direction.
