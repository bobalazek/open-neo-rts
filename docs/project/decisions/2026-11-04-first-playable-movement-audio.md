# 2026-11-04 — First-playable movement audio

Task 2-36 adds original two-second mono 48 kHz Vorbis loops for the existing
Eastern Collective playable roster: Field Technician, Collective Soldier,
Rocket Trooper, Drone Hunter, Supply Truck, Dragon Tank and Metamorphic APC.
Editable seeded FFmpeg graphs stay beside each definition's existing source;
the [single-clip rebuild command](./2026-11-04-first-combat-sounds.md#rebuilding-one-clip)
applies. Owner credit follows the accepted agent-made asset decision. No external
recordings or new gameplay definitions are introduced.

The `presentation.sounds.move_loop` reference supplies an Effects-bus loop,
distinct from the future `move` spoken acknowledgement. Infantry use quiet,
alternating footfalls; vehicles use low motor and rolling/track textures. These
are provisional first-pass signatures, not final sound direction or full-mix
loudness qualification.

Only displacement between consecutive permitted, visible observations starts a
loop. Queued orders and an immobile unit do not. Each moving actor owns one
disposable scope. Its positional source follows current coordinates, including
while decoding. Stop it on no movement, disable, disappearance, fog loss, pause,
rewind, vision-group change and session disposal. First sight does not infer
movement through hidden space. Unchanged-tick updates do not restart a loop.

Movement priority is −1, below existing combat/work cues; existing per-source and
global voice limits still apply. A loop evicted by priority, distance or mute is
eligible again on a later visible update without duplicating active or decoding
voices. The mixer keeps existing camera-relative distance culling and device
volumes. No simulation state, events, versions or gameplay hashes change.

Other-roster movement, aircraft/naval textures, general impacts, music, announcer
speech/subtitles and category/full-mix loudness remain task 2-36. Footfall cadence
is provisional; animation-phase and speed synchronization are later polish.
