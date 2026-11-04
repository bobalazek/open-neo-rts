---

version: 1
slug: "src-features-content-editor-index-ts"
primary_target: "src/features/content-editor/index.ts"
related_targets: ["src/features/content-editor/content-tools.css", "src/features/content-editor/definition-editor.ts", "src/features/content-editor/definition-pack.ts", "src/features/content-editor/playtest.ts", "src/features/debug/session.ts", "src/features/debug/catalog.ts", "src/features/debug/palette.ts", "src/features/debug/reproduction.ts", "../render/src/units/preview.ts"]
---

# Model-first content tools

Operate extension of Graphite Command Stations for asset authors. Original
models lead the view; native graphite controls inspect their actual team slots,
authored clips, disjoint LOD branches and damage-state nodes. There is no new
identity, raster or decorative motion. The initial model rests; animation plays
only when explicitly chosen.

Desktop keeps the model left and a scrolling tool pane right. Narrow views keep
the model above that pane so controls and subject remain together. A compact
installed-model search/picker and local-file action lead to real load status,
validation-kind controls and project-check results. Material, node and socket
inventories use the existing native expandable/table treatment, including
keyboard table scrolling. HTML retains semantics and a usable graphics fallback.

The signature interaction is changing a real model's presentation while reading
the same project validator used by the CLI. A failed candidate retains the last
good model and offers retry. Unknown installed links cannot fetch arbitrary
remote models. Model inspection remains available beside the authoring extension
below; asset gizmos remain an explicit phase-2 follow-up.

## Definition authoring extension

The same Operate pane now opens owner-selected pack folders, with a writable
directory handle where supported and a read-only folder/download fallback. The
actual original model stays left/above; schema-derived fields occupy the existing
native pane. General, Combat, Visuals, Production, Upgrades and Eras expose only
groups present in the current schema. Descriptions/units are contextual. One
field-change menu collects optional and collection changes instead of a wall of
Add/Remove actions. Status identifies the source path and unsaved state.

The inherited native Settings fields/actions set the quality bar: identical
graphite/ivory/warm-metal controls, readable choices, synchronized focus, no
decorative motion or new identity. The safety interaction is reviewing a disk
conflict without losing a draft. Busy operations lock editable controls; invalid
input survives tab changes; failed writes preserve the draft. Definition checks
share schemas, pack resolution, gameplay compilation and model requirements.
Full runtime audio, source freshness and exact formatter parity remain explicit
2-38b2 work before the whole 2-38b task can close. Combat/economy integration,
authored opponent presets and weapon/destruction effects remain 2-38c2;
asset editing remains 2-38d.

## Sibling-definition creation extension

New from selected uses a clean unit, structure or prop as the authored template
for a sibling. The story is template → new display/folder names → create or
download → cancel/recovery. This code-led Operate extension inherits Graphite
Command Stations; the original brick model remains the subject, left of the
native form on desktop and above it when narrow. Two framed fields temporarily
replace the definition form; Create definition, Download changes ZIP and Cancel
creation stay pinned. Read-only folders omit Create definition. No new palette,
tokens, assets or motion accompany the workflow.

Shared checks gate creation. Writable folders copy the complete co-located
folder with credits intact, verify the payloads and publish the manifest last.
Conflicts stop creation. Errors retain entered names; cleanup preserves changed
or inaccessible new files with recovery feedback. Success selects and previews
the new definition. The ZIP is a changes bundle containing the new folder and
updated manifest, for extraction into a copy of the selected pack; it is not a
standalone pack and downloading never changes the source. Cancel returns to the
original definition. Busy work locks the controls. Browser writes retain their
optimistic concurrency limits. The creation decision is
`../../../../docs/project/decisions/2026-11-04-definition-creation.md`.

## Unsaved draft playtest extension

Playtest draft beside Save takes a validated copied existing definition, including
unsaved edits, into the existing HTML debug worker. The story is unsaved edit →
validated snapshot → movement/health/placement checks → Return to draft. This
2-38c1 slice inherits the native editor's Graphite Command Stations identity and
retains the existing debug HTML controls over real terrain. Return to draft
comes first in a bounded scrolling pane, followed by the explicit scope notice;
existing map, Force, palette and inspector controls remain manual. Narrow screens
retain that scrollable pane above visible terrain. No new palette, tokens,
assets, components or decorative motion accompany the transition.

Writable packs are refreshed; the draft replaces only copied validation inputs.
Shared resolution, gameplay compilation, provenance and GLB checks gate launch.
Checked model bytes are frozen into device-local Blob URLs for the session.
Pack-qualified identity and existing human-to-sim conversion remain intact.
Node structures start on Sandbox: Resources, naval units and shore/water
footprints on Sandbox: Water, and other definitions on Sandbox: Flat. The draft
is preselected in the spawn palette. Existing blue/red Force slots retain the
existing faction identity; they do not imply an opponent AI.

The editor retains its unsaved fields while model/panel rendering is suspended.
Return to draft remains available after worker failure, disposes worker/scene
and temporary model URLs, then restores the native pane, model rendering and
initiating focus. Leaving content tools also releases the playtest resources.
No source files, manifest, saved definitions, normal-match state or simulation
behavior change. Canonical command-log export contains the actual copied debug
definitions and commands. Copy initial setup link is disabled because a URL
cannot carry the unsaved draft or models; export is a simulation reproduction,
not an asset pack.

Combat/economy integration, authored opponent presets and weapon/destruction
effects remain 2-38c2; the whole 2-38c task is unfinished. Native debug conversion,
2-38b2 parity and asset editing retain their separate scope. The decision is
`../../../../docs/project/decisions/2026-11-04-draft-debug-playtest.md`.
