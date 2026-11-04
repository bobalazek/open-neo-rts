# Browser definition authoring

Task 2-38b1 extends the model-first tool with editing existing unit, structure
and prop definitions from owner-selected pack folders. The authored schemas
generate scalar, enum, boolean, nested object, record and array fields. Opaque
schema values retain a JSON field. Authored content already uses human units;
schema descriptions supply contextual units/help. Unassigned future properties
appear under General instead of requiring a second form schema.

The existing native pane and original model remain in place. Only applicable
General/Combat/Visuals/Production/Upgrades/Eras tabs appear. A single field-change
menu collects optional/collection changes. Open/Save are pinned; conflict review
temporarily replaces fields with changed-value rows and pinned Reload/Keep
choices. Source paths remain available on the definition picker's contextual
help; compact status identifies the definition, pack and unsaved state.

## Source and write boundaries

Pack folders are explicitly chosen. File System Access handles permit writes to
the existing selected file; browsers without that API use a read-only folder
input and JSON download. Multiple opened packs supply dependencies. No file is
uploaded, no simulation state is edited, and no asset provenance is invented.
New files, manifest mutations and binary asset editing are separate work.

Before a write/download, a copied candidate goes through the shared schemas,
pack resolver/reference/identity checks, gameplay compiler and model requirements.
Writable folders are re-read, and only the candidate target's parsed JSON is
substituted so an explicitly reviewed corrupt target can be repaired. Error
results prevent saving. The existing input/model files are not mutated during
validation. These are definition/model checks, not the complete asset/audio
conformance and formatter parity still required in 2-38b2. The UI names that
boundary in contextual help; the whole 2-38b task stays open.

The latest target text is compared with the loaded baseline before validation
and immediately before opening a write stream. Changed text produces a conflict;
only explicit Reload or Keep changes that decision. Failed writes abort their
stream and retain the draft. This is optimistic checking, not an atomic filesystem
compare-and-swap: another program can still write between the final check and
stream close. The browser supplies replacement/abort semantics.

Loading, validation and saving lock fields and conflicting actions. Selection
failures restore the actual picker identity. Invalid numeric/JSON text survives
tab changes; collection changes wait until parsing errors are corrected. Back
and definition replacement require saving/discarding; page unload retains the
browser's unsaved-edit guard. Download starts a copy and keeps the source dirty.

Provisional resource bounds are 10,000 directory entries, 32 directory levels,
2 MiB per definition/JSON file and 256 MiB combined runtime data. Sources are
listed but not read into validation memory.
File snapshots, JSON, layers and runtime bytes are read in batches of 32 after
their applicable path/size preflight, retaining input order. This avoids hundreds
of sequential Blob/file operations during a Save.

Conflict display caps at 100 changed leaf values and shortens values beyond 512 characters, with explicit disclosure;
the underlying versions remain intact.

Browser downloads use two-space JSON with a final newline. Exact Biome output,
full binary/provenance/audio/conformance validation, source freshness, new-unit
templates and multi-file creation remain explicit follow-up scope. Draft worker
playtests and asset gizmos remain 2-38c/d. SIM59, built-in definitions, gameplay
balance and original assets are unchanged.
