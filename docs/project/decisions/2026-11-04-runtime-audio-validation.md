# 2026-11-04 — Decode and meter runtime audio during asset validation

**Context.** The first ten original combat/work clips are integrated. Audio can
also use [verified CC0 sources](2026-11-04-cc0-audio.md). `validate-assets` previously
checked Ogg provenance only, so a corrupt export, stereo positional effect or
over-loud clip could pass the same content gate as a valid model.

**Decision.** Extend `bun neo validate-assets` (and therefore `bun neo validate`)
to inspect runtime Ogg framing and decode/meter the entire clip with FFmpeg.
Require a complete single logical Vorbis/Opus stream, ordered pages and correct
checksums. The small container check follows the
[Xiph framing specification](https://xiph.org/ogg/doc/framing.html); it also rejects
truncation/chaining that a streaming decoder may otherwise tolerate. Read codec
and channel identity from the identification packet, rather than guessing from
filenames or decoder diagnostic text.

Unit, structure and prop clips are mono. Other runtime clips may have one or two
channels; music-specific metadata and the final stereo/full-mix rules remain
with the actual music system. Silent/unmeasurable exports and decoding errors
fail validation. FFmpeg's EBU R128 true-peak summary rounds to 0.1 dB, so require
a reading at or below −1.1 dBTP to preserve headroom against the existing −1 dBTP
limit. Do not apply the full-mix −24 LUFS target to short effects or rewrite assets
during validation. Category/full-mix loudness and listening remain unfinished.

Use FFmpeg as an installed CLI prerequisite, not a game dependency: Bun has no
audio decoder, and the tool supplies codec decoding and the EBU meter. CI installs
it for tooling tests and content validation. Missing FFmpeg produces an actionable
failure when runtime audio is present. Force Ogg input, allow only file/pipe
protocols and Vorbis/Opus decoders, pass arguments without a shell, and bound each
decode to 30 seconds and 4 MiB of diagnostics. No runtime client/server imports or
simulation changes are needed.

Editable files under `source/` are not runtime exports. Retain them for provenance
without demanding runtime format/model checks or an additional `assets.json`
beside each original source. Runtime exports retain their existing provenance
entries and LFS rules. The validator is read-only.

**Browser authoring follow-up (November 5).** The container gate now lives in
`packages/content/src/assets/validate-audio.ts`, using byte views without Node,
DOM or decoder dependencies. CLI validation calls that same gate before its
unchanged full FFmpeg decode/meter. Editor validation applies it to every runtime
Ogg in all opened packs: complete single-stream framing, CRCs, codec identification
and channels. Effects beside unit/structure/prop definitions remain mono; music
folder exports remain stereo. Editable sources stay excluded by the existing
shared export classification. Diagnostics retain pack/file identity.

The common draft resolver gates writes, JSON/ZIP downloads, sibling creation and
both draft playtest modes. Failed checks preserve the draft and source files;
repairing the source permits retry. This closes the container-integrity gap, not
full browser audio parity: a checksummed container can still contain undecodable,
silent or over-loud samples. Native codec decoding and true-peak measurement,
source/schema freshness and exact project formatting remain task 2-38b2. No
simulation version, source media or built-in content identity changes.

**Native decoder follow-up (November 5).** [Offline browser decoding and sample
checks](2026-11-05-editor-audio-decoding.md) now reject undecodable, silent,
non-finite and excessive sample-level exports through the same save/playtest
gates. True-peak meter parity, source/schema freshness and exact formatting
remain open; the earlier container-only limitation above records that delivery's
scope.
