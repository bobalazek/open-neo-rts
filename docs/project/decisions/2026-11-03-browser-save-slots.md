# 2026-11-03 — Local browser save slots

Task 2-34 connects the history-verified snapshot API to normal single-player play.
IndexedDB stores named saves, one quicksave and three rotating autosaves. Autosave
runs at mission start and every three wall-clock minutes; it is host scheduling,
not simulation state. Loaded games start paused and do not immediately overwrite
their source with a new autosave. Quicksave/load use menu buttons, preserving the
documented browser function keys until configurable bindings exist.

Each portable file includes its name/type/ID, creation time, skirmish configuration,
a 320×180 view thumbnail, actual installed pack IDs/versions/gameplay/cosmetic
hashes, map hash and the complete versioned match snapshot/history. Current
first-playable content is still the Eastern Collective mirror on Training Grounds.
Installed setup is regenerated from current content; file-supplied definitions or
maps cannot replace it. Imports are limited to 64 MiB, validated in an isolated
worker and assigned a fresh named-save ID before persistence. SVG/foreign preview
URLs are refused. Incompatible simulation/gameplay rows remain visible with an
explanation and disabled loading; no migration is claimed.

The normal menu exposes named saves and the shared load list; Home exposes Load
game and Continue when a compatible save exists. The list supports type/search,
date order, previews, export/import and confirmed deletion. Failed IndexedDB
transactions retain the previous slot. Loading rechecks the displayed slot's
revision; deletion compares the complete displayed record inside the same atomic
read/write transaction, preventing another tab's unseen replacement being deleted.

Replacement is transactional at the session boundary. Pause and retain the old
host, prepare the new renderer/worker/UI offscreen, and commit only after readiness.
Failure, cancellation and timeout dispose only the candidate. The retained active
host's error callback follows session identity rather than the abandoned loading
generation, so canceling a load cannot disable its later failure recovery.

**Export refinement:** a pending worker input is now applied at the next real tick
boundary before capturing a save. This supersedes 2-33a's refusal while inputs are
pending, avoiding a paused-menu deadlock without discarding orders or inventing
an unrecorded state mutation. Empty pending input does not advance the match.
Normal matches use the same simulation version/outcomes and golden hashes.

The current loader still reconstructs and verifies history (2-33b direct state
loading remains open). Graphics/audio preferences and camera/selection are device
presentation state rather than canonical saved gameplay; restored sessions use
current preferences, an empty selection and the chosen spawn view. Configurable
autosave cadence, the desktop app's native file storage and multiplayer server
saves remain later work. The three-minute/three-slot defaults are provisional.
