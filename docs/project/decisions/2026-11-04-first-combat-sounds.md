# 2026-11-04 — First original combat sounds

**Context.** The phase-2 mixer and native Audio controls are implemented, but the
content has no gameplay clips. The normal skirmish already emits permitted launch,
flight, impact and death events. The existing Collective Soldier and Dragon Tank
provide infantry and heavy-vehicle reference sounds without adding gameplay content.

**Decision.** Give each of these two units original mono 48 kHz Ogg Vorbis fire,
impact and brick-breakup clips, authored from seeded noise, oscillator envelopes
and delayed resonances. Editable FFmpeg filter graphs live beside their existing
brick sources; `assets.json` credits Borut Balazek under the accepted
[agent-made asset decision](2026-11-01-agent-made-asset-author.md). No samples,
recordings or third-party assets are used. These are provisional first-pass sounds,
not unit voice lines or final sound-direction approval.

An impact uses the `presentation.sounds.impact` reference of its visible launch,
correlated by the already projected round handle. Keep that association only while
the round remains visible in consecutive snapshots. Forget it on a missing/hidden
round, pause, vision-group change or rewind. A visible impact with no observed
launch remains silent until a generic impact library is supplied. Sounds stay
outside canonical state, and death audio can use the preceding permitted entity
when the destroyed unit has already disappeared.

**Rebuilding one clip.** From its unit folder, substitute that clip's basename:

```sh
ffmpeg -hide_banner -filter_complex_script source/dragon-tank.fire.lavfi \
  -ar 48000 -ac 1 -c:a libvorbis -q:a 5 -fflags +bitexact \
  -flags:a +bitexact -map_metadata -1 dragon-tank.fire.ogg
```

The editable graphs control the complete signal; fixed seeds make the noise
repeatable with the same FFmpeg build. Compressed bytes can differ across encoder
versions. Keep source and encoded asset together and use Git LFS for the Ogg files.
Judge these short clips by decoded peak and listening rather than integrated LUFS
alone. The project-wide loudness validator, remaining roster clips, generic surface
impacts, construction/movement, speech/subtitles and original music remain phase-2
work; this batch does not close task 2-36.
