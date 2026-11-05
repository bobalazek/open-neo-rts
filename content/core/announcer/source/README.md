# Original synthetic announcer

This is an intentionally mechanical, non-neural computer voice, not a recording
or imitation of a person. The agent-made asset is credited to Borut Balazek under
the project's accepted credit policy. The English transcript, priority and
cooldown for every used line are in `phrases.json`; the runtime atlas and its
generated cue offsets come from those same inputs.

Rebuild from the repository root with Bun, eSpeak NG 1.52.0 and FFmpeg:

```sh
bun content/core/announcer/source/render.ts
```

The command writes exactly one runtime Ogg and this source directory's cue table.
The client compiles that table into JavaScript. It is source metadata rather than
a new gameplay definition or an extra pack JSON format. No TTS program, voice
data, online service or paid model is included in the game.

The generator uses the ordinary `en-us+klatt` formant voice at 160 words/minute,
pitch 35, with no MBROLA voice or human recording. It joins the PCM in memory,
leaves 100 ms between lines and normalizes its sample peak to −6 dBFS before
mono 48 kHz Opus encoding at 48 kbit/s. Each cue records the original sample-frame
start and duration, allowing native bounded playback from one decoded buffer.
The shared asset validator decodes the complete export and checks true peak.

Tool provenance: [eSpeak NG](https://github.com/espeak-ng/espeak-ng) is GPL-3.0-or-later;
it is used only as a local authoring tool. The [GNU output guidance](https://www.gnu.org/licenses/gpl-faq.en.html#GPLOutput)
distinguishes generated output from copied program material. Our inputs are the
project's own short event lines, not imported recordings or licensed character
performances. Original game assets retain the repository's MIT license.

Source/rights check: 2026-11-05. No generative model produced the samples
(`ai_involvement: none`); `synthetic_voice: true` records the audible synthesis.
No voice likeness, property release or expiring license applies. The provisional
voice and full-mix listening/loudness remain later polish; no human listening
qualification is claimed by decoding and peak checks alone.
