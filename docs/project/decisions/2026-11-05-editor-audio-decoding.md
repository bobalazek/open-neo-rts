# Native audio decoding before editor saves

Phase-2 task 2-38b2 now checks actual browser decoding after the shared runtime
Ogg framing/checksum/channel gate. A well-framed stream can still have an invalid
codec header or unusable decoded samples; container acceptance alone is not
save-time audio validation.

The client uses a native `OfflineAudioContext` at 48 kHz, decoding serially
without connecting to audio output or touching the app-owned mixer. It passes a
copy of each encoded buffer because
[`decodeAudioData` detaches its input](https://www.w3.org/TR/webaudio-1.1/#dom-baseaudiocontext-decodeaudiodata).
The original validated export bytes remain available for model checks, temporary
playtest URLs and downloads. Editable source media remain excluded.

Decoding errors, empty/silent buffers, non-finite samples and sample peaks above
−1.1 dBFS become existing file-specific validation errors. This is an early sample
gate, not an EBU true-peak meter: the CLI's full FFmpeg decode and true-peak check
remain required. No new browser fallback, dependency, audio permission, device
setting, content format or simulation/version change is introduced.

The same default checker reaches existing-definition Save/JSON download,
sibling creation/ZIP download, the fresh disk validation before manifest
publication, and both debug and normal draft playtests. Failure retains the
draft and prevents publication or session creation. Bun domain tests explicitly
inject a checker because they have no native browser decoder; production callers
use the native default. A small isolated check covers buffer detachment,
silence, non-finite/excessive samples and decoder failure.

The browser regression modifies the original Vorbis identification version and
recomputes its Ogg page checksum. Independent shared-container checking accepts
that complete stream; the native codec must refuse it. The real editor Save
then makes no write and retains the edited health field. Restoring the original
clip permits a normal save. These use in-memory handles and never alter original
assets. Current Chrome and WebKit are the supported decoder targets.

The complete definition-editor batch passes 20/20 across those two browsers,
including existing-file save/download, sibling creation/ZIP, conflict recovery
and both draft playtest modes. Repository typecheck, all eleven test groups,
build and browser TypeScript checks pass. Independent probes confirm the mutated
stream passes framing validation and native errors propagate through the shared
resolver and creation/playtest gates before asset URLs are created.

True-peak meter parity, source/schema freshness and exact formatter parity remain
open in 2-38b2. This bounded decoder gate does not close the whole editing task.
