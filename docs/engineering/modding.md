# Modding

A mod is a **content pack**: the same JSON definitions, assets, maps and translations the official game uses ([content-pipeline.md](content-pipeline.md)). There is no mod scripting; anything a mod can do, the official content does the same way.

## What a mod can do

- Add units and structures (with their weapons, abilities and research inline), factions, maps, campaigns, biomes and languages.
- Change existing definitions through **overrides**: a mod declares which base definitions it patches and how (field-level patches, validated like everything else).
- Add new eras built on the same rule modules.

What it can't do: run code, change engine behaviour, or override UI strings and screens. When a mod needs new behaviour, that's an engine feature request.

## Pack structure

```text
content/my-mod/
├── manifest.json                  id, name, version, authors, licence, engine range, dependencies
├── factions/<faction>/
│   ├── faction.json
│   ├── units/<name>/              unit.json, its assets and assets.json
│   └── structures/<name>/         structure.json, its assets and assets.json
├── neutral/structures/<name>/     faction-agnostic structures
├── props/<biome>/<name>/          map objects: prop.json and its model
├── maps/<name>/
├── campaigns/<name>/
└── locales/<lang>.json            translations only
```

Assets sit next to the definition that uses them, as in `core` ([content-format.md](../contributing/content-format.md#layout)).

- `manifest.json` declares the **engine version range** and **dependencies** (other packs with version ranges). Load order is resolved deterministically from dependencies, then by ID.
- IDs are namespaced by pack (`my-mod.unit:<faction>/hovertank`) so mods can't collide.

## Loading

- **Local mods:** drop a folder or zip into the mods directory (desktop) or import it in the Mods screen (web, stored in IndexedDB).
- Every mod is validated on load with the same validators as official content. Invalid mods are listed with their errors and stay disabled.
- **Safety:** zips are checked for path traversal, oversized files and unsupported formats ([map-editor.md §9](map-editor.md#9-security-and-file-constraints)).

## Multiplayer

- A room lists its active packs and their hashes. Joining players who lack a pack can download it from the host's room (small packs) or from the mod registry (later).
- The match only starts when every client's resolved content hash matches.
- Ranked play uses official packs only.

## Sharing (later)

A mod registry: browse, rate, subscribe and update mods in-game, backed by a simple server. Uploads are validated before they're listed, and reported mods can be pulled.

## Tooling

- `packages/mod-sdk`: schema exports, a `create-mod` template, and a CLI to validate and package a mod.
- A reference mod (`content/example-mod/`) is added with the modding SDK in phase 5, and validated in CI from then on.
