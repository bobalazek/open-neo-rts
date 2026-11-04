# Device audio mixer and native controls

The [audio design](../../design/audio-events.md) needs one presentation-side
mixer, independent of simulation state. Reuse installed Babylon Audio V2 rather
than adding an audio library. Its [engine ownership and Web Audio distinction](https://forum.babylonjs.com/t/audio-engine-v2-usage/56965/9)
and installed 9.33.1 declarations are the API authority. Established RTS
[OpenRA notification traits](https://docs.openra.net/en/release/traits/) likewise
separate sound references from notifications; retain our authored data and fog
contract.

The application owns one lazily activated engine across navigation, with master,
music, effects, unit voices, announcer, interface and ambience levels. Scenes own
disposable playback scopes. Decode caches share buffers, while simultaneous
positional instances remain separate. Provisional limits are six instances per
source and 32 overall; a higher-priority request can replace the oldest
lowest-priority instance. Drop unavailable, muted or locked playback rather than
queueing it for a later gesture. Engine failures cannot stop gameplay.

Settings → Audio uses the existing native panel and synchronized semantic
controls. Choose a channel and integer percentage, preview or test it, mute all,
or mute when the page loses focus. Apply saves a separate versioned device
profile; Back/cancel restores saved levels. Failed persistence retains the saved
profile and the editable preview. No graphics/bindings profile or save format
changes. Defaults are provisional under the owner's accepted implementation
autonomy.

Audio descriptions appear in native hover/focus tooltips and semantic accessible
descriptions. Status and recovery remain visible. The shared panel distinguishes
these descriptions from incumbent permanent field help. Long native option lists
use a viewport-clamped scroll popup, initially revealing the current value;
wheel, scrollbar and pointer selection reach every percentage and long Controls
action list without changing the underlying semantic selects.

_Addition:_ a short original procedural PCM click/test cue supplies actual
interface feedback and a mixer test, without an external recording or binary
asset. It does not replace the required original sound library. Installed
definition `presentation.sounds.fire/death` references flow through the existing
catalog build adapter into current normal-match launch/death observations.
Fog, pause, rewind/view changes and scope disposal revoke pending/active sounds;
candidate sessions remain silent before presentation commits. Camera-relative
spatialization stays in the renderer.

The content currently supplies no authored sound clips. Weapon/impact/movement
and construction assets, announcement speech/subtitles/priority queue, faction
music/playlist/ducking, loudness validation and replay audio remain explicit
2-36 work. This delivery establishes a working mixer, controls and the initial
data path; it does not close first-playable audio or phase 2. No canonical state,
simulation version or deterministic goldens change.
