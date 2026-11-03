# 2026-11-03 — Preserve unchanged live button labels

WebKit can drop a button click if its text node is replaced between pointerdown
and pointerup, even when the replacement text is identical. The live match HUD
rewrote idle/group/command labels and recipe text on every worker snapshot. An
instrumented failed producer selection contained both pointer events but no
click; a minimal native-button reproduction confirmed the text replacement.
Use the shared `setText` guard for labels updated by snapshots. The real-match
result journey now holds the producer pointer down, pauses through the actual
HUD/worker, waits for the snapshot paint, then releases and checks selection.
It fails on the old WebKit bundle and passes only when that click survives;
direct worker replies with unknown request IDs cannot prove a UI update because
the client correctly ignores them.
