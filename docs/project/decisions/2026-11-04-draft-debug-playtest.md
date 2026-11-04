# Unsaved draft snapshots in debug

Task 2-38c is delivered in two functional parts. **2-38c1** sends a validated
unsaved definition and its original model snapshot to the existing debug worker
for movement, health and placement checks. **2-38c2** retains combat/economy
playtesting, authored opponent presets and weapon/destruction effects. The debug
worker currently has no normal combat/economy systems; the UI states that limit.
This does not complete 2-38c or the complete content editor.

Playtest draft is available beside Save for valid existing definitions, including
unsaved changes. Open writable packs are refreshed and the selected draft is
substituted only in copied validation inputs. The shared resolver, gameplay
compiler, provenance and GLB checks operate on that same copied snapshot. Invalid
drafts never launch a worker. Full audio/source/formatter parity remains 2-38b2.

Runtime models become device-local Blob URLs backed by the checked bytes; the
debug renderer cannot silently switch back to an installed or later-edited file.
Pack-qualified IDs and the existing human-to-sim conversion are retained. The
worker receives normal debug definitions for movement/placement, not a forged
normal-match setup or relaxed permission contract. No simulation behavior or
version changes. Source files, manifest, saved definitions and normal matches
are untouched.

The selected draft is preselected in the spawn palette. Naval units and authored
shore/water footprints start on Sandbox: Water; node structures start on
Sandbox: Resources; other definitions start on Sandbox: Flat. Authors can change
the existing map/Force controls and submit actual placement commands. Two
opposing Force slots use the existing faction identity and blue/red colours;
this does not invent an opponent AI or promise active combat in this slice.

The original editor and its unsaved fields remain owned while its model/panel
rendering is suspended. Return to draft disposes the worker, scene and temporary
asset URLs, restores the native pane and resumes the model. Initialization
failure retains the same Return action. Repeated entry and leaving the content
tools release their resources rather than orphaning workers.

Canonical command-log export contains the copied simulation definitions and
commands, so the CLI can reproduce the session. Copy initial setup link is
disabled: a URL cannot carry the unsaved definition or its models. Export is a
simulation reproduction, not an asset pack. The existing debug HTML controls
remain; their native UI conversion is separate unfinished work.
