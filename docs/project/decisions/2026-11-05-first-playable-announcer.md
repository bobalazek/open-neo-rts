# First-playable announcer

Phase-2 task 2-36 now supplies the core announcements for implemented local-match
systems. This is presentation work: no simulation state, balance, version or
outcome hash changes. The accepted provisional implementation autonomy covers
the presentation defaults below.

## Events and boundaries

The announcer consumes the controlled seat's existing copied HUD observations.
It announces hits to the player's structures, harvesters and numbered control
groups, other units outside the base, and currently observed allied structures.
Private production stalls and brownout belong only to the player's Force.
Construction-site transitions announce completion. Explicit published producer
exit events announce trained units; a new opaque actor handle is insufficient,
because transport unloading also creates one. Losses require an observed death
event, rather than inferring death from fog or grant disappearance. Canonical
victory results supply victory, defeat or draw once.

The existing numbered-group membership chooses the first matching group in
1–9, then 0 order. Provisional presentation defaults coalesce ordinary unit
attack warnings into 8×8-cell areas and treat a unit within six cells of a
completed friendly building as inside its base. These are notification filters,
not construction, navigation or sight rules. Initial/loading/inactive snapshots
establish a baseline rather than announcing every starting entity. Pausing,
hiding, leaving or rewinding clears pending speech and stale completion callbacks.
No hidden attacker origins or enemy economic details enter messages.

Priorities and cooldowns follow [audio events](../../design/audio-events.md).
Higher priority interrupts lower; critical always interrupts. At most two
same-priority lines wait, with a three-second age limit. Lower-priority lines
arriving during higher-priority speech are dropped. Location-bearing messages
reuse the existing feed and click-to-jump alert position; they replace an
equivalent generic notice instead of duplicating it. Short native captions use
the existing battlefield feedback area, with a semantic live-status mirror for
assistive access. Muted or unavailable audio retains timed captions.
An initial decode gets a bounded three-second start window, then playback uses
the actual line duration. The old short silent-caption timeout could cancel a
cold first decode before it started; an independent deferred-decode reproduction
and focused regression cover the correction. Hosted browser diagnostics record
decode timing/errors and successful native starts without guessing atlas identity
from its whole-buffer duration.

## Asset and playback

One original mono 48 kHz Opus atlas contains 24 English lines (37.46 seconds,
including gaps), generated with the non-neural eSpeak NG formant synthesizer.
This is intentionally mechanical speech, not a person's recording or likeness.
The source transcript, cue table, local generator and provenance live under
`content/core/announcer/`; no authoring tool or voice data ships in the game.
See its [source record](../../../content/core/announcer/source/README.md) for
the tool/output distinction, accepted author credit and regeneration command.

The existing app-owned Babylon mixer plays each line using native buffer start
and duration limits. Saved Announcer/Master levels, activation, mute, voice caps
and existing music ducking apply. Source cue metadata lives under the existing
`source/` classification and compiles into the client; it does not introduce
an unknown gameplay JSON exemption or new pack format.

## Evidence and remaining scope

Focused checks cover ownership, priority/queue/cooldowns, stale callbacks,
pause/history, muted captions, explicit losses and real producer-exit readiness.
An independent actual-simulation load/unload reproduction confirms that transport
unloading no longer announces Unit ready in either the speech or generic feed.
The full repository typecheck, tests and build pass, and content validation
checks 911 assets without errors or warnings, including full atlas decoding and
true peak.

Current Chrome and WebKit exercise the real app/mixer and atlas. A clearly
presentation-only copied-snapshot fixture supplies power and harvester-damage
observations; it does not claim those were achieved through gameplay. The power
line asserts the native start offset and duration, pause clears its caption,
muted harvester speech retains one feed entry without a new audio source, and
an actual worker surrender supplies Defeat with its checked native offset.
Desktop and narrow captures show the same native caption/feed extension.

Research, capture, superweapon, objective and multiplayer announcements await
their real systems. Other-roster clips, replay audio, full-mix/category loudness
and human listening remain open. The synthetic voice is provisional; successful
decoding/browser playback does not qualify hardware hearing or final voice
direction. This slice does not complete task 2-36 or phase 2.
