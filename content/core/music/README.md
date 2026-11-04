# Original first-playable music

Three instrumental cues use original note patterns, seeded percussion and oscillator
synthesis. Command Board is a restrained menu bed; Assembly Line and Steel March
are mechanical in-match tracks for the current Eastern Collective playable roster.
This is provisional music direction, not final faction art approval.

Approach: `programmatic`; `ai_involvement: none` at the audio-sample level. A coding
agent wrote the score and synthesis code at the owner's direction. No generative
audio model, voice, sample, recording or third-party music was used. Credit follows
the [agent-made asset decision](../../../docs/project/decisions/2026-11-01-agent-made-asset-author.md).
The score names MIDI notes, tempos and arrangements. The renderer is editable source;
it writes one stereo WAV to stdout and does not rewrite other files.

From this folder, rebuild **one** named track:

```sh
node source/render.mjs command-board | ffmpeg -hide_banner -f wav -i pipe:0 \
  -af loudnorm=I=-24:TP=-2:LRA=9 -ar 48000 -ac 2 -c:a libvorbis -q:a 4 \
  -fflags +bitexact -flags:a +bitexact -map_metadata -1 command-board.ogg
```

Substitute `assembly-line` or `steel-march` for the corresponding source/output.
Sources are reproducible with the same runtime/encoder; compressed bytes may change
across encoders. Runtime Ogg files use Git LFS. Check the encoded file's full decoded
LUFS/true peak and stereo channels before committing; a configured loudness filter
alone is not a qualification. These track levels do not prove full gameplay-mix
loudness or listening quality.
