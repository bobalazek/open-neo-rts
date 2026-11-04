# 2026-11-04 — Shared asset provenance checks

Task 2-38b2a moves runtime export classification and provenance checks into
`packages/content`, shared by `bun neo validate-assets` and browser definition
save/download validation. It retains the existing GLB, PNG, WebP, Ogg and KTX2
export set and excludes declared asset folders' editable `source/` subtrees.
An arbitrary ancestor named `source` does not hide a runtime export.

Runtime exports require metadata, and metadata entries require an existing file
and nonempty author/source strings. Entry paths cannot escape the asset folder.
Credit and extra provenance fields are retained verbatim. Source references may
name project tooling outside a selected pack, as existing map exports do; this
check neither reads those references nor verifies their freshness, creator or
license. No authorship is inferred or rewritten.

The CLI reports malformed metadata instead of failing with an uncaught JSON
exception. CLI and browser also share Khronos glTF conformance and generic model
checks for every runtime GLB, including unreferenced wrecks and rubble. The
existing `gltf-validator` dependency moves from CLI to a separate content
authoring entry point; simulation imports do not load it. External resources
retain the CLI's empty-byte resolver rather than fetching arbitrary URLs.
Definition-specific model checks remain in both workflows. Browser errors use
the existing save guard and native feedback; invalid metadata or GLBs block
writes and downloads without changing the loaded pack or draft.

Referenced browser models retain their definition's kind and material mappings.
The standalone CLI asset command retains its existing generic-material policy;
supporting artist aliases there remains a separate CLI correction.

This completes the provenance and GLB slice. Runtime audio validation,
source/schema freshness and exact formatter parity remain 2-38b2. Existing
definition creation, draft playtesting and asset editing remain their named
tasks. Runtime identity and simulation outcomes are unchanged.
