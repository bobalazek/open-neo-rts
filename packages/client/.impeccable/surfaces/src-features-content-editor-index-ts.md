---

version: 1
slug: "src-features-content-editor-index-ts"
primary_target: "src/features/content-editor/index.ts"
related_targets: ["src/features/content-editor/content-tools.css", "src/features/content-editor/definition-editor.ts", "src/features/content-editor/definition-pack.ts", "src/features/content-editor/playtest.ts", "src/features/content-editor/skirmish-playtest.ts", "src/features/match/session.ts", "src/features/debug/session.ts", "src/features/debug/catalog.ts", "src/features/debug/palette.ts", "src/features/debug/reproduction.ts", "../render/src/units/preview.ts", "../render/src/units/preview-actions.ts", "src/locales/en.json"]
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
2-38b2 work before the whole 2-38b task can close. Broader authored opponent/map
presets remain 2-38c2;
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

Broader authored opponent/map presets remain 2-38c2; the whole 2-38c task is
unfinished. Native debug conversion,
2-38b2 parity and asset editing retain their separate scope. The decision is
`../../../../docs/project/decisions/2026-11-04-draft-debug-playtest.md`.

## Temporary normal skirmish extension

Skirmish draft beside the debug action extends the same code-led Operate flow:
inspect model/validator → edit → checked frozen snapshot → normal Training
Grounds Eastern Collective mirror/basic bot → Return to retained draft. Native
loading, HUD and match menus inherit Graphite Command Stations and original brick
models. Objective, clock and global controls stay above; economy and selection
occupy the lower left and the circular minimap stays right, with existing narrow
stacking. No new composition, seed, cards, assets or tokens define this extension.

Supported drafts are existing core first-playable definitions, compatible
prerequisite-free priced units trained by their producers, and prerequisite-free
priced Eastern Collective or neutral structures. Compatible cloned units join
only the temporary roster. Other packs, factions, props and definitions outside
this compatibility gate retain the debug path; a restriction preserves edits.
Launch does not guarantee every edited recipe or movement domain can execute;
normal engine validation still rejects incompatible commands. Normal starter-kit
and map checks still gate launch. Combat, construction, production, resources
and fog use normal commands and permissions without debug spawning.

Checked metadata and model/wreck/icon/sound bytes remain fixed across restarts;
later source-file changes do not replace them. Each preview owns a worker,
renderer and audio mixer. Restarts reuse its mixer; Cancel, Return or failure
releases preview resources, decoded buffers and temporary URLs, resumes the
retained model/panel and focuses the initiating action for that mode. Failure
also exposes a readable editor error. Save/Load, quicksave, autosaves, replay
storage and contextual guidance writes are unavailable; sources and manifest
are untouched. Installed Field Manual identifies the installed reference while
actor stats, recipes and help use the draft catalog.

Chrome and WebKit journeys and their desktop/narrow captures support this
bounded integration. Full runtime audio/source/formatter parity remains 2-38b2;
broader authored opponent/map presets remain 2-38c2, and asset gizmos remain
2-38d. This does not close the whole
editor/playtest task. The decision is
`../../../../docs/project/decisions/2026-11-04-draft-normal-skirmish.md`.

## Isolated model-action extension

Fire, Destroy and Restore model extend the same code-led Operate pane so authors
can check an original model's socket direction, recoil and destruction without
entering a match. The story is selected/Preview model snapshot → Fire or Destroy
→ Restore model or failed-pair Retry. The incumbent model-left/native-pane-right
desktop layout stacks when narrow. Framed actions remain visible while editing;
hover/focus explains their limits. Original brick geometry and the existing
Graphite Command Stations palette, Arial ramp and controls remain authoritative.
There is no new seed, composition, raster, font or decorative motion; the requested
effects are functional and explicit. Editing a field alone does not apply it:
unsaved data enters these actions only through Preview model.

Fire resolves raw weapon-assigned socket names and their suffixed nodes, or muzzle
sockets for standalone art, then uses available `fire_recoil`/`attack`. A short
flash and fixed model-relative +Z tracer show actual socket direction without
audio, gameplay range or simulation. Destroy plays the full authored death clip
or scatters at most 32 visible original geometry pieces before revealing the
paired wreck. Matching driven turret/barrel aiming carries relative to rest,
preserving the wreck's authored tilt and non-part geometry. Unpaired standalone
art disappears after its effect. Restore clears effects and returns to rest,
retaining team, LOD and damage choices.

The bounded self-contained inspections gate both live and wreck bytes. Staged
model/wreck loads replace the view together; failed or superseded pairs preserve
the last good model and Retry. Replacement/disposal releases owned meshes,
materials and containers. Retained draft playtests pause the effect clock rather
than letting it advance offscreen. Shared no-options preview callers remain
compatible. No source, save, normal match or simulation state changes.

This closes only isolated firing/destruction within 2-38c2. Broader authored
opponent/map presets, full 2-38b2 validation/formatter parity and 2-38d socket/part
gizmos, GLB export and damage-socket smoke/fire previews remain open. Current
Chrome/WebKit browser checks do not qualify Firefox, physical touch/IME, screen
readers or hardware FPS. The decision is
`../../../../docs/project/decisions/2026-11-04-model-action-previews.md`.
